import { assertRole } from '../../domain/access.js'
import { fail } from '../../domain/errors.js'
import { classCaption } from '../../domain/structure.js'
import { cleanLabel, cleanText } from '../../domain/text.js'
import * as usersRepo from '../../repositories/users.js'
import { changePassword, createAccount, profile } from '../accounts.js'
import { classInOrg } from './scope.js'

function mapLearner(row) {
  return {
    id: row.id,
    login: row.login,
    displayName: row.display_name || row.login,
    classId: row.class_id,
    classLabel: classCaption(row),
  }
}

const LEARNERS_PAGE = 100

export async function listLearners(actor, query = {}) {
  assertRole(actor, 'org')
  const limit = Math.min(500, Math.max(1, Number(query.limit) || LEARNERS_PAGE))
  const offset = Math.max(0, Number(query.offset) || 0)
  const classId = typeof query.classId === 'string' && query.classId ? query.classId : null
  const search = cleanText(query.search)
  const filter = { organizationId: actor.organizationId, classId, search }
  const total = await usersRepo.countLearners(filter)
  const rows = await usersRepo.listLearners(filter, { limit, offset })
  return { learners: rows.map(mapLearner), total, offset, limit }
}

export async function createLearner(actor, input) {
  assertRole(actor, 'org')
  const klass = await classInOrg(input?.classId, actor.organizationId)
  const displayName = cleanLabel(input?.displayName, 2, 80, 'Имя')
  const user = await createAccount({
    role: 'learner',
    login: input?.login,
    password: input?.password,
    displayName,
    organizationId: actor.organizationId,
    classId: klass.id,
  })
  return { ...user, classLabel: classCaption(klass) }
}

export async function updateLearner(actor, id, input) {
  assertRole(actor, 'org')
  const current = await usersRepo.findLearner(id, actor.organizationId)
  if (!current) fail('Тестируемый не найден', 404)
  const klass = await classInOrg(input?.classId, actor.organizationId)
  const displayName = cleanLabel(input?.displayName, 2, 80, 'Имя')
  await usersRepo.updateLearner(id, { displayName, classId: klass.id })
  await changePassword(id, input?.password)
  const user = await profile(id)
  return { ...user, classLabel: classCaption(klass) }
}

export async function deleteLearner(actor, id) {
  assertRole(actor, 'org')
  const changes = await usersRepo.deleteLearner(id, actor.organizationId)
  if (!changes) fail('Тестируемый не найден', 404)
}
