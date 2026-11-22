import crypto from 'node:crypto'
import { assertRole } from '../../domain/access.js'
import { fail } from '../../domain/errors.js'
import { groupsFromRow, readGroups } from '../../domain/structure.js'
import { cleanLabel, sameText } from '../../domain/text.js'
import * as lessonsRepo from '../../repositories/lessons.js'
import * as repo from '../../repositories/lessonSections.js'

function mapSection(row) {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    groups: groupsFromRow(row),
  }
}

function brief(row) {
  if (!row) return null
  return { id: row.section_id, name: row.name, sortOrder: row.sort_order }
}

async function uniqueName(name, exceptId = '') {
  const rows = await repo.listSections()
  if (rows.some((row) => row.id !== exceptId && sameText(row.name, name))) {
    fail('Раздел с таким названием уже есть')
  }
}

export async function requireSection(id) {
  const row = await repo.findSection(id)
  if (!row) fail('Раздел не найден', 404)
  return mapSection(row)
}

export async function sectionBrief(lessonId) {
  return brief(await repo.findPlacement(lessonId))
}

export async function sectionBriefs() {
  const map = new Map()
  for (const row of await repo.listPlacements()) map.set(row.lesson_id, brief(row))
  return map
}

export async function placeLesson(lessonId, sectionId) {
  await requireSection(sectionId)
  const current = await repo.findPlacement(lessonId)
  if (current && current.section_id === sectionId) return
  await repo.replacePlacement(lessonId, sectionId)
  await lessonsRepo.setLessonSortOrder(lessonId, await lessonsRepo.nextLessonSortOrder())
}

export async function detachLesson(lessonId) {
  await repo.deleteLessonPlacement(lessonId)
}

async function copyGroups(sectionId, groups) {
  for (const lessonId of await repo.lessonIdsInSection(sectionId)) {
    await lessonsRepo.setLessonGroups(lessonId, groups)
  }
}

export async function listLessonSections(actor) {
  assertRole(actor, 'super')
  return (await repo.listSections()).map(mapSection)
}

export async function createLessonSection(actor, input) {
  assertRole(actor, 'super')
  const name = cleanLabel(input?.name, 2, 80, 'Название раздела')
  const groups = readGroups(input)
  await uniqueName(name)
  const id = crypto.randomUUID()
  await repo.insertSection({
    id,
    name,
    sortOrder: await repo.nextSort(),
    groups,
    createdAt: new Date().toISOString(),
  })
  return requireSection(id)
}

export async function updateLessonSection(actor, id, input) {
  assertRole(actor, 'super')
  await requireSection(id)
  const name = cleanLabel(input?.name, 2, 80, 'Название раздела')
  const groups = readGroups(input)
  await uniqueName(name, id)
  await repo.updateSection(id, { name, groups })
  await copyGroups(id, groups)
  return requireSection(id)
}

export async function deleteLessonSection(actor, id) {
  assertRole(actor, 'super')
  await requireSection(id)
  await repo.deleteSection(id)
}

export async function assignLessonSection(actor, lessonId, sectionId) {
  assertRole(actor, 'super')
  const lesson = await lessonsRepo.lessonExists(lessonId)
  if (!lesson) fail('Урок не найден', 404)
  const section = await requireSection(sectionId)
  await placeLesson(lessonId, sectionId)
  await lessonsRepo.setLessonGroups(lessonId, section.groups)
  return section
}

export async function reorderLesson(actor, lessonId, input = {}) {
  assertRole(actor, 'super')
  const lesson = await lessonsRepo.lessonExists(lessonId)
  if (!lesson) fail('Урок не найден', 404)
  const placement = await repo.findPlacement(lessonId)
  const sectionId = placement?.section_id || null
  const rows = await lessonsRepo.listLessonsInBucket(sectionId)
  const ids = rows.map((row) => row.id)
  const from = ids.indexOf(lessonId)
  if (from < 0) return { ok: true }
  const to = typeof input?.neighborId === 'string' && input.neighborId
    ? ids.indexOf(input.neighborId)
    : from + (Number(input?.direction) < 0 ? -1 : 1)
  if (to >= 0 && to < ids.length && to !== from) {
    ;[ids[from], ids[to]] = [ids[to], ids[from]]
    await lessonsRepo.saveLessonOrder(ids, sectionId)
  }
  return { ok: true }
}
