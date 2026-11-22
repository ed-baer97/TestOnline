import crypto from 'node:crypto'
import { assertRole } from '../../domain/access.js'
import { allocateUniqueLogin, generatePassword, loginBaseFromName, readPassword } from '../../domain/accounts.js'
import { fail } from '../../domain/errors.js'
import { classCaption } from '../../domain/structure.js'
import { cleanLabel, cleanText } from '../../domain/text.js'
import * as organizationsRepo from '../../repositories/organizations.js'
import * as regionsRepo from '../../repositories/regions.js'
import * as usersRepo from '../../repositories/users.js'
import { changePassword, createAccount, profile } from '../accounts.js'
import { classInOrg, resolveTargetOrgId } from './scope.js'

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

export async function learnerTargets(actor) {
  assertRole(actor, 'super')
  const [regions, organizations] = await Promise.all([
    regionsRepo.listRegions(),
    organizationsRepo.listAllOrganizations(),
  ])
  return {
    regions: regions.sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    organizations: organizations.sort((a, b) => a.name.localeCompare(b.name, 'ru')),
  }
}

export async function listLearners(actor, query = {}) {
  const organizationId = await resolveTargetOrgId(actor, typeof query.organizationId === 'string' ? query.organizationId : null)
  const limit = Math.min(500, Math.max(1, Number(query.limit) || LEARNERS_PAGE))
  const offset = Math.max(0, Number(query.offset) || 0)
  const classId = typeof query.classId === 'string' && query.classId ? query.classId : null
  const search = cleanText(query.search)
  const filter = { organizationId, classId, search }
  const total = await usersRepo.countLearners(filter)
  const rows = await usersRepo.listLearners(filter, { limit, offset })
  return { learners: rows.map(mapLearner), total, offset, limit }
}

async function createLearnerWithAutoLogin({ password, displayName, organizationId, classId }) {
  const base = loginBaseFromName(displayName)
  const taken = await usersRepo.findTakenLoginsByPrefixes([base])
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidateBase = attempt >= 4
      ? `${base.slice(0, 22).replace(/\.+$/, '')}${crypto.randomInt(1000, 10000)}`
      : base
    const login = allocateUniqueLogin(candidateBase, taken)
    try {
      return await createAccount({
        role: 'learner',
        login,
        password,
        displayName,
        organizationId,
        classId,
      })
    } catch (error) {
      if (error.status === 409 && attempt < 4) continue
      throw error
    }
  }
  return null
}

export async function createLearner(actor, input) {
  const organizationId = await resolveTargetOrgId(actor, input?.organizationId)
  const klass = await classInOrg(input?.classId, organizationId)
  const displayName = cleanLabel(input?.displayName, 2, 80, 'Имя')
  const rawLogin = cleanText(input?.login)
  const rawPassword = input?.password == null ? '' : String(input.password)
  const autoPassword = rawPassword === ''
  const password = autoPassword ? generatePassword() : rawPassword
  if (!autoPassword) readPassword(password)
  const user = rawLogin
    ? await createAccount({
      role: 'learner',
      login: rawLogin,
      password,
      displayName,
      organizationId,
      classId: klass.id,
    })
    : await createLearnerWithAutoLogin({ password, displayName, organizationId, classId: klass.id })
  return {
    ...user,
    classLabel: classCaption(klass),
    ...(autoPassword ? { password } : {}),
  }
}

export async function updateLearner(actor, id, input) {
  assertRole(actor, 'org', 'super')
  const current = actor.role === 'org'
    ? await usersRepo.findLearner(id, actor.organizationId)
    : await usersRepo.findLearnerById(id)
  if (!current) fail('Тестируемый не найден', 404)
  const orgId = actor.role === 'org' ? actor.organizationId : current.organization_id
  const klass = await classInOrg(input?.classId, orgId)
  const displayName = cleanLabel(input?.displayName, 2, 80, 'Имя')
  const password = readPassword(input?.password)
  await usersRepo.updateLearner(id, { displayName, classId: klass.id })
  await changePassword(id, password)
  const user = await profile(id)
  return { ...user, classLabel: classCaption(klass) }
}

export async function deleteLearner(actor, id) {
  assertRole(actor, 'org', 'super')
  const changes = actor.role === 'org'
    ? await usersRepo.deleteLearner(id, actor.organizationId)
    : await usersRepo.deleteLearnerById(id)
  if (!changes) fail('Тестируемый не найден', 404)
}
