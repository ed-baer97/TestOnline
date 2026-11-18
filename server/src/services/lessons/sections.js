import crypto from 'node:crypto'
import { assertRole } from '../../domain/access.js'
import { fail } from '../../domain/errors.js'
import { groupsFromRow, readGroups } from '../../domain/structure.js'
import { cleanLabel } from '../../domain/text.js'
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

function sameName(left, right) {
  return left.localeCompare(right, 'ru', { sensitivity: 'accent' }) === 0
}

async function uniqueName(name, exceptId = '') {
  const rows = await repo.listSections()
  if (rows.some((row) => row.id !== exceptId && sameName(row.name, name))) {
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
  await repo.replacePlacement(lessonId, sectionId)
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
  await repo.replacePlacement(lessonId, sectionId)
  await lessonsRepo.setLessonGroups(lessonId, section.groups)
  return section
}
