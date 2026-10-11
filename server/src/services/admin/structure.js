import crypto from 'node:crypto'
import { assertRole } from '../../domain/access.js'
import { fail } from '../../domain/errors.js'
import { BANDS, bandForGrade } from '../../domain/structure.js'
import { cleanLabel, sameText } from '../../domain/text.js'
import * as classesRepo from '../../repositories/classes.js'
import * as tracksRepo from '../../repositories/tracks.js'
import * as usersRepo from '../../repositories/users.js'
import { mustOrg } from './scope.js'

export async function structure(actor) {
  assertRole(actor, 'org')
  const org = await mustOrg(actor.organizationId)
  const mapped = await classesRepo.listOrganizationClasses(org.id)
  const tracks = await tracksRepo.listTracks(org.id)
  const sections = []
  for (const band of BANDS) {
    if (!org.groups[band.id]) continue
    if (band.id === 'students') {
      sections.push({
        id: band.id,
        label: band.label,
        kind: 'students',
        tracks: [...tracks]
          .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
          .map((track) => ({
            id: track.id,
            name: track.name,
            classes: mapped.filter((item) => item.trackId === track.id).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
          })),
      })
    } else {
      sections.push({
        id: band.id,
        label: band.label,
        kind: 'school',
        grades: band.grades.map((grade) => ({
          grade,
          label: `${grade} класс`,
          classes: mapped.filter((item) => item.band === band.id && item.grade === grade).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
        })),
      })
    }
  }
  return { organization: org, sections }
}

function assertUniqueClass(rows, name, exceptId) {
  if (rows.some((row) => row.id !== exceptId && sameText(row.name, name))) fail('Такой класс уже есть', 409)
}

export async function createTrack(actor, input) {
  assertRole(actor, 'org')
  const org = await mustOrg(actor.organizationId)
  if (!org.groups.students) fail('В организации не отмечены студенты')
  const name = cleanLabel(input?.name, 2, 40, 'Название курса')
  const rows = await tracksRepo.listTracks(org.id)
  if (rows.some((row) => sameText(row.name, name))) fail('Такой курс уже есть', 409)
  const id = crypto.randomUUID()
  await tracksRepo.insertTrack({ id, organizationId: org.id, name, createdAt: new Date().toISOString() })
  return { id, name }
}

export async function updateTrack(actor, id, input) {
  assertRole(actor, 'org')
  const current = await tracksRepo.findTrack(id, actor.organizationId)
  if (!current) fail('Курс не найден', 404)
  const name = cleanLabel(input?.name, 2, 40, 'Название курса')
  const rows = await tracksRepo.listTracks(actor.organizationId)
  if (rows.some((row) => row.id !== id && sameText(row.name, name))) fail('Такой курс уже есть', 409)
  await tracksRepo.renameTrack(id, name)
  return { id, name }
}

export async function deleteTrack(actor, id) {
  assertRole(actor, 'org')
  const current = await tracksRepo.findTrack(id, actor.organizationId)
  if (!current) fail('Курс не найден', 404)
  const classes = await classesRepo.countTrackClasses(id)
  if (classes) fail('Сначала удалите группы этого курса')
  await tracksRepo.deleteTrack(id)
}

export async function createClass(actor, input) {
  assertRole(actor, 'org')
  const org = await mustOrg(actor.organizationId)
  const name = cleanLabel(input?.name, 1, 20, 'Название класса')
  if (input?.trackId) {
    if (!org.groups.students) fail('В организации не отмечены студенты')
    const track = await tracksRepo.findTrack(input.trackId, org.id)
    if (!track) fail('Курс не найден', 404)
    assertUniqueClass(await classesRepo.listTrackClassNames(org.id, input.trackId), name)
    const id = crypto.randomUUID()
    await classesRepo.insertTrackClass({ id, organizationId: org.id, trackId: input.trackId, name, createdAt: new Date().toISOString() })
    return { id, name, band: 'students', trackId: input.trackId }
  }
  const grade = Number(input?.grade)
  const band = bandForGrade(grade)
  if (!band) fail('Такой параллели нет')
  if (!org.groups[band.id]) fail('Эта группа в организации не отмечена')
  assertUniqueClass(await classesRepo.listGradeClassNames(org.id, band.id, grade), name)
  const id = crypto.randomUUID()
  await classesRepo.insertGradeClass({ id, organizationId: org.id, band: band.id, grade, name, createdAt: new Date().toISOString() })
  return { id, name, band: band.id, grade }
}

export async function updateClass(actor, id, input) {
  assertRole(actor, 'org')
  const current = await classesRepo.findClass(id, actor.organizationId)
  if (!current) fail('Класс не найден', 404)
  const name = cleanLabel(input?.name, 1, 20, 'Название класса')
  if (current.track_id) assertUniqueClass(await classesRepo.listTrackClassNames(actor.organizationId, current.track_id), name, id)
  else assertUniqueClass(await classesRepo.listGradeClassNames(actor.organizationId, current.band, current.grade), name, id)
  await classesRepo.renameClass(id, name)
  return { id, name }
}

export async function deleteClass(actor, id) {
  assertRole(actor, 'org')
  const current = await classesRepo.findClassId(id, actor.organizationId)
  if (!current) fail('Класс не найден', 404)
  const learners = await usersRepo.countLearnersInClass(id)
  if (learners) fail('В классе есть тестируемые. Сначала переведите или удалите их')
  await classesRepo.deleteClass(id)
}
