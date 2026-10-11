import { fail } from '../../domain/errors.js'
import { GROUP_KEYS } from '../../domain/structure.js'
import { config } from '../../infrastructure/config.js'
import * as classesRepo from '../../repositories/classes.js'
import * as lessonsRepo from '../../repositories/lessons.js'

export function attemptLimit() {
  return config.lessonMaxAttempts
}

export async function learnerBand(actor) {
  if (actor.band && GROUP_KEYS.includes(actor.band)) return actor.band
  const row = await classesRepo.findClassBand(actor.classId)
  if (!row?.band || !GROUP_KEYS.includes(row.band)) fail('Класс тестируемого не найден', 404)
  return row.band
}

export async function canSee(actor, row) {
  if (actor.role === 'super') return true
  if (actor.role !== 'learner') return false
  const band = await learnerBand(actor)
  return Boolean(row[band])
}

export async function mustLesson(id) {
  const row = await lessonsRepo.findLesson(id)
  if (!row) fail('Урок не найден', 404)
  return row
}
