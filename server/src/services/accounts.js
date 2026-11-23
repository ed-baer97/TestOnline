import crypto from 'node:crypto'
import { allocateUniqueLogin, loginBaseFromName, normalizeAccount, readPassword } from '../domain/accounts.js'
import { fail } from '../domain/errors.js'
import { classCaption } from '../domain/structure.js'
import { cleanLabel, cleanText } from '../domain/text.js'
import { config } from '../infrastructure/config.js'
import { hashPassword, verifyPassword } from '../infrastructure/passwords.js'
import { sessionMatchesPassword } from '../infrastructure/session.js'
import * as districtsRepo from '../repositories/districts.js'
import * as organizationsRepo from '../repositories/organizations.js'
import * as quizzesRepo from '../repositories/quizzes.js'
import * as regionsRepo from '../repositories/regions.js'
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
  return { id: row.id, login: row.login, role: row.role || 'host', passwordHash: row.password_hash }
}

function presentProfile(row) {
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

export async function profile(id) {
  return presentProfile(await usersRepo.findProfileRow(id))
}

export async function sessionProfile(session) {
  if (!session?.userId) return null
  const row = await usersRepo.findProfileRow(session.userId)
  if (!row || !sessionMatchesPassword(session, row.password_hash)) return null
  return presentProfile(row)
}

export async function ensureSuperAdmin() {
  const existing = await usersRepo.findSuperAdmin()
  if (existing) return profile(existing.id)
  const login = config.superLogin
  const password = config.superPassword
  const account = normalizeAccount({ login, password })
  const taken = await usersRepo.findByLogin(account.login)
  if (taken) {
    fail(`Логин «${account.login}» уже занят другим пользователем. Суперглавный не создан — задайте другой SUPER_LOGIN`, 500)
  }
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

// Вызывающий проверяет пароль через readPassword до записи остальных полей, иначе неверный пароль
// даст 400 уже после сохранения имени.
export async function changePassword(id, password) {
  const next = readPassword(password)
  if (!next) return
  await usersRepo.updatePasswordHash(id, await hashPassword(next))
}

export async function registrationOptions() {
  const [regions, districts, organizations] = await Promise.all([
    regionsRepo.listRegions(),
    districtsRepo.listAllDistricts(),
    organizationsRepo.listAllOrganizations(),
  ])
  return {
    roles: [{ id: 'org', label: 'Директор школы' }],
    regions: regions
      .map((r) => ({ id: r.id, name: r.name, nameKk: r.nameKk || '' }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    districts: districts.map((d) => ({
      id: d.id,
      regionId: d.region_id,
      name: d.name,
      nameKk: d.name_kk || '',
    })),
    organizations: organizations
      .map((o) => ({
        id: o.id,
        regionId: o.regionId,
        districtId: o.districtId || null,
        name: o.name,
        nameKk: o.nameKk || '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
  }
}

export async function registerAccount(input) {
  const role = cleanText(input?.role ?? 'org')
  if (role !== 'org') fail('Сейчас доступна регистрация только для роли «Директор школы»')
  const firstName = cleanLabel(input?.firstName, 2, 40, 'Имя')
  const lastName = cleanLabel(input?.lastName, 2, 40, 'Фамилия')
  const password = String(input?.password ?? '')
  if (password.length < 6 || password.length > 72) fail('Пароль от 6 до 72 символов')
  const organizationId = typeof input?.organizationId === 'string' ? input.organizationId.trim() : ''
  if (!organizationId) fail('Выберите организацию')
  const org = await organizationsRepo.findOrganization(organizationId)
  if (!org) fail('Организация не найдена', 404)

  const displayName = `${firstName} ${lastName}`
  const base = loginBaseFromName(displayName)
  const taken = await usersRepo.findTakenLoginsByPrefixes([base])
  const passwordHash = await hashPassword(password)
  const createdAt = new Date().toISOString()

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidateBase = attempt >= 4
      ? `${base.slice(0, 22).replace(/\.+$/, '')}${crypto.randomInt(1000, 10000)}`
      : base
    const login = allocateUniqueLogin(candidateBase, taken)
    const id = crypto.randomUUID()
    try {
      await usersRepo.insertUser({
        id,
        login,
        passwordHash,
        createdAt,
        role: 'org',
        displayName,
        regionId: null,
        organizationId: org.id,
        classId: null,
      })
      return { user: await profile(id), passwordHash }
    } catch (error) {
      if (usersRepo.isLoginTaken(error) && attempt < 4) continue
      if (usersRepo.isLoginTaken(error)) fail('Не удалось подобрать свободный логин. Попробуйте снова', 409)
      throw error
    }
  }
  fail('Не удалось подобрать свободный логин. Попробуйте снова', 409)
}
