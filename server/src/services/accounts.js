import crypto from 'node:crypto'
import { normalizeAccount, readPassword } from '../domain/accounts.js'
import { fail } from '../domain/errors.js'
import { classCaption } from '../domain/structure.js'
import { config } from '../infrastructure/config.js'
import { hashPassword, verifyPassword } from '../infrastructure/passwords.js'
import * as quizzesRepo from '../repositories/quizzes.js'
import * as resultsRepo from '../repositories/results.js'
import * as usersRepo from '../repositories/users.js'
import { addDemoQuiz } from './quizzes.js'

// Ведущих заводят из кода (тесты, старые базы): HTTP-маршрута регистрации нет.
// Первый ведущий забирает квизы и итоги, которые лежали в базе без владельца.
export async function registerUser({ login, password }) {
  const first = (await usersRepo.countUsers()) === 0
  const id = crypto.randomUUID()
  const passwordHash = await hashPassword(password)
  try {
    await usersRepo.insertHost({ id, login, passwordHash, createdAt: new Date().toISOString() })
  } catch (error) {
    if (usersRepo.isLoginTaken(error)) fail('Такой логин уже занят', 409)
    throw error
  }
  if (first) {
    await quizzesRepo.claimOrphanQuizzes(id)
    await resultsRepo.claimOrphanResults(id)
  }
  if ((await quizzesRepo.countQuizzes(id)) === 0) await addDemoQuiz(id)
  return { id, login }
}

export async function authenticate(login, password) {
  const row = await usersRepo.findCredentials(String(login || '').trim())
  if (!row || !(await verifyPassword(password, row.password_hash))) return null
  return { id: row.id, login: row.login, role: row.role || 'host' }
}

export async function profile(id) {
  const row = await usersRepo.findProfileRow(id)
  if (!row) return null
  const klass = row.class_id && row.class_name ? row : null
  return {
    id: row.id,
    login: row.login,
    role: row.role || 'host',
    displayName: row.display_name || row.login,
    regionId: row.region_id || null,
    regionName: row.region_name || null,
    organizationId: row.organization_id || null,
    organizationName: row.organization_name || null,
    classId: row.class_id || null,
    className: klass?.class_name || null,
    classLabel: classCaption(klass),
    band: klass?.band || null,
  }
}

export async function ensureSuperAdmin() {
  const existing = await usersRepo.findSuperAdmin()
  if (existing) return profile(existing.id)
  const login = config.superLogin
  const password = config.superPassword
  const account = normalizeAccount({ login, password })
  const taken = await usersRepo.findByLogin(account.login)
  if (taken) return profile(taken.id)
  const id = crypto.randomUUID()
  await usersRepo.insertSuperAdmin({
    id,
    login: account.login,
    passwordHash: await hashPassword(account.password),
    createdAt: new Date().toISOString(),
    displayName: 'Суперглавный',
  })
  return profile(id)
}

export async function createAccount({ role, login, password, displayName, regionId, organizationId, classId }) {
  const account = normalizeAccount({ login, password })
  const id = crypto.randomUUID()
  const passwordHash = await hashPassword(account.password)
  try {
    await usersRepo.insertUser({
      id,
      login: account.login,
      passwordHash,
      createdAt: new Date().toISOString(),
      role,
      displayName,
      regionId: regionId || null,
      organizationId: organizationId || null,
      classId: classId || null,
    })
  } catch (error) {
    if (usersRepo.isLoginTaken(error)) fail('Такой логин уже занят', 409)
    throw error
  }
  return profile(id)
}

export async function changePassword(id, password) {
  const next = readPassword(password)
  if (!next) return
  await usersRepo.updatePasswordHash(id, await hashPassword(next))
}
