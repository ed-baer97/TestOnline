import crypto from 'node:crypto'
import { db, getLaunchQuiz, getQuiz, isUnique, listSuperQuizzes } from './db.js'
import {
  BANDS,
   assertRole,
  cellText,
  clean,
  cleanLabel,
  fail,
  groupNumbers,
  mapGroups,
  normalizeAccount,
  optionalLabel,
  readGroups,
} from './domain.js'
import { hashPassword, verifyPassword } from './passwords.js'
import { dashboard, orgStats, platformStats } from './stats.js'

export { BANDS, dashboard, orgStats, platformStats }

function sameText(left, right) {
  return left.localeCompare(right, 'ru', { sensitivity: 'accent' }) === 0
}

export async function count(sql, ...params) {
  const row = await db.get(sql, ...params)
  return Number(row?.n || 0)
}

function readPassword(value) {
  if (value == null || String(value) === '') return null
  const pass = String(value)
  if (pass.length < 6 || pass.length > 72) fail('Пароль от 6 до 72 символов')
  return pass
}

function bandForGrade(grade) {
  return BANDS.find((band) => band.grades.includes(grade)) || null
}

const MANGYSTAU_DIVISIONS = [
  [1, 'Бейнеуский район', 'Бейнеу ауданы'],
  [2, 'Каракиянский район', 'Қарақия ауданы'],
  [3, 'Мангистауский район', 'Маңғыстау ауданы'],
  [4, 'Мунайлинский район', 'Мұнайлы ауданы'],
  [5, 'Тупкараганский район', 'Түпқараған ауданы'],
  [6, 'город Актау', 'Ақтау қаласы'],
  [7, 'город Жанаозен', 'Жаңаөзен қаласы'],
]

function isMangystau(name, nameKk = '') {
  const folded = `${name} ${nameKk}`
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replaceAll('ғ', 'г')
    .replaceAll('ң', 'н')
    .replaceAll('ұ', 'у')
    .replaceAll('ү', 'у')
    .replaceAll('қ', 'к')
    .replaceAll('ө', 'о')
    .replaceAll('і', 'и')
    .replaceAll('ы', 'и')
  return folded.includes('мангистау')
}

export function mapOrg(row) {
  return {
    id: row.id,
    regionId: row.region_id,
    districtId: row.district_id || null,
    districtName: row.district_name || '',
    districtNameKk: row.district_name_kk || '',
    name: row.name,
    nameKk: row.name_kk || '',
    groups: mapGroups(row),
    createdAt: row.created_at,
  }
}

export function classCaption(row) {
  if (!row) return null
  const name = row.class_name || row.name
  if (row.band === 'students') return `${name} · ${row.track_name || row.trackName || 'Студенты'}`
  return `${name} · ${row.grade} класс`
}

export async function profile(id) {
  const row = await db.get(
    `SELECT u.id, u.login, u.role, u.display_name, u.display_name_kk, u.region_id, u.organization_id, u.class_id,
            r.name AS region_name, r.name_kk AS region_name_kk, o.name AS organization_name, o.name_kk AS organization_name_kk,
            c.name AS class_name, c.grade, c.band, t.name AS track_name
     FROM users u
     LEFT JOIN regions r ON r.id = u.region_id
     LEFT JOIN organizations o ON o.id = u.organization_id
     LEFT JOIN classes c ON c.id = u.class_id
     LEFT JOIN tracks t ON t.id = c.track_id
     WHERE u.id = ?`,
    id,
  )
  if (!row) return null
  const klass = row.class_id && row.class_name ? row : null
  return {
    id: row.id,
    login: row.login,
    role: row.role || 'host',
    displayName: row.display_name || row.login,
    displayNameKk: row.display_name_kk || '',
    regionId: row.region_id || null,
    regionName: row.region_name || null,
    regionNameKk: row.region_name_kk || '',
    organizationId: row.organization_id || null,
    organizationName: row.organization_name || null,
    organizationNameKk: row.organization_name_kk || '',
    classId: row.class_id || null,
    className: klass?.class_name || null,
    classLabel: classCaption(klass),
    band: klass?.band || null,
  }
}

let boot
export function bootAdmin() {
  if (!boot) {
    boot = (async () => {
      const user = await ensureSuperAdmin()
      await ensureRegionalDivisions()
      const { ensureDemoLesson, migrateLessonFiles } = await import('./lessons.js')
      await ensureDemoLesson()
      const moved = await migrateLessonFiles()
      if (moved) console.log(`Картинки слайдов перенесены на диск: ${moved}`)
      return user
    })().catch((error) => {
      boot = null
      throw error
    })
  }
  return boot
}

export async function ensureSuperAdmin() {
  const login = process.env.SUPER_LOGIN || 'super'
  const password = process.env.SUPER_PASSWORD || 'super12345'
  const account = normalizeAccount({ login, password })
  const existing = await db.get("SELECT id, display_name, password_hash FROM users WHERE role = 'super' LIMIT 1")
  if (existing) {
    if (process.env.SUPER_PASSWORD && !(await verifyPassword(account.password, existing.password_hash))) {
      await setPassword(existing.id, account.password)
    }
    if (existing.display_name === 'Суперглавный') {
      await db.run('UPDATE users SET display_name = ? WHERE id = ?', 'Администратор платформы', existing.id)
    }
    return profile(existing.id)
  }
  const taken = await db.get('SELECT id FROM users WHERE lower(login) = lower(?)', account.login)
  if (taken) return profile(taken.id)
  const id = crypto.randomUUID()
  await db.run(
    `INSERT INTO users (id, login, password_hash, created_at, role, display_name)
     VALUES (?, ?, ?, ?, 'super', ?)`,
    id,
    account.login,
    await hashPassword(account.password),
    new Date().toISOString(),
    'Администратор платформы',
  )
  return profile(id)
}

async function insertUser({ role, login, password, displayName, displayNameKk = '', regionId, organizationId, classId }) {
  const account = normalizeAccount({ login, password })
  const id = crypto.randomUUID()
  const passwordHash = await hashPassword(account.password)
  try {
    await db.run(
      `INSERT INTO users (id, login, password_hash, created_at, role, display_name, display_name_kk, region_id, organization_id, classId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`.replace('classId', 'class_id'),
      id,
      account.login,
      passwordHash,
      new Date().toISOString(),
      role,
      displayName,
      displayNameKk || '',
      regionId || null,
      organizationId || null,
      classId || null,
    )
  } catch (error) {
    if (isUnique(error)) fail('Такой логин уже занят', 409)
    throw error
  }
  return profile(id)
}

async function setPassword(id, password) {
  const next = readPassword(password)
  if (!next) return
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(next), id)
}

export async function mustRegion(id) {
  const row = await db.get('SELECT id, name, name_kk, created_at FROM regions WHERE id = ?', id)
  if (!row) fail('Регион не найден', 404)
  return { id: row.id, name: row.name, nameKk: row.name_kk || '', createdAt: row.created_at }
}

export async function mustOrg(id) {
  const row = await db.get(
    `SELECT o.*, d.name AS district_name, d.name_kk AS district_name_kk
     FROM organizations o
     LEFT JOIN districts d ON d.id = o.district_id
     WHERE o.id = ?`,
    id,
  )
  if (!row) fail('Организация не найдена', 404)
  return mapOrg(row)
}

async function districtInRegion(districtId, regionId) {
  const districts = await count('SELECT COUNT(*) AS n FROM districts WHERE region_id = ?', regionId)
  if (!districts) return null
  const row = await db.get('SELECT id FROM districts WHERE id = ? AND region_id = ?', districtId, regionId)
  if (!row) fail('Выберите район')
  return row.id
}

export async function ensureRegionalDivisions(regionId) {
  const rows = regionId
    ? [await db.get('SELECT id, name, name_kk FROM regions WHERE id = ?', regionId)].filter(Boolean)
    : await db.all('SELECT id, name, name_kk FROM regions')
  for (const region of rows) {
    if (!isMangystau(region.name, region.name_kk || '')) continue
    for (const [order, name, nameKk] of MANGYSTAU_DIVISIONS) {
      const existing = await db.get('SELECT id FROM districts WHERE region_id = ? AND lower(name) = lower(?)', region.id, name)
      if (existing) continue
      await db.run(
        'INSERT INTO districts (id, region_id, name, name_kk, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        crypto.randomUUID(),
        region.id,
        name,
        nameKk,
        order,
        new Date().toISOString(),
      )
    }
  }
}

export async function listDistricts(actor) {
  assertRole(actor, 'regional')
  const rows = await db.all(
    'SELECT id, name, name_kk FROM districts WHERE region_id = ? ORDER BY sort_order, name',
    actor.regionId,
  )
  return rows.map((row) => ({ id: row.id, name: row.name, nameKk: row.name_kk || '' }))
}

async function orgInRegion(id, regionId) {
  const org = await mustOrg(id)
  if (org.regionId !== regionId) fail('Организация не найдена', 404)
  return org
}

export async function learnerCounts(orgIds) {
  if (!orgIds.length) return new Map()
  const marks = orgIds.map(() => '?').join(',')
  const rows = await db.all(
    `SELECT organization_id AS id, COUNT(*) AS n FROM users
     WHERE role = 'learner' AND organization_id IN (${marks}) GROUP BY organization_id`,
    ...orgIds,
  )
  return new Map(rows.map((row) => [row.id, Number(row.n)]))
}

export async function listRegions(actor) {
  assertRole(actor, 'super')
  const regions = await db.all('SELECT id, name, name_kk, created_at FROM regions')
  const [orgRows, adminRows, learnerRows] = await Promise.all([
    db.all('SELECT region_id AS id, COUNT(*) AS n FROM organizations GROUP BY region_id'),
    db.all("SELECT region_id AS id, COUNT(*) AS n FROM users WHERE role = 'regional' GROUP BY region_id"),
    db.all(
      `SELECT o.region_id AS id, COUNT(*) AS n
         FROM users u
         JOIN organizations o ON o.id = u.organization_id
        WHERE u.role = 'learner'
        GROUP BY o.region_id`,
    ),
  ])
  const orgMap = new Map(orgRows.map((row) => [row.id, Number(row.n)]))
  const adminMap = new Map(adminRows.map((row) => [row.id, Number(row.n)]))
  const learnerMap = new Map(learnerRows.map((row) => [row.id, Number(row.n)]))
  return regions
    .map((region) => ({
      id: region.id,
      name: region.name,
      nameKk: region.name_kk || '',
      createdAt: region.created_at,
      organizations: orgMap.get(region.id) || 0,
      admins: adminMap.get(region.id) || 0,
      learners: learnerMap.get(region.id) || 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

export async function createRegion(actor, input) {
  assertRole(actor, 'super')
  const name = cleanLabel(input?.name, 2, 80, 'Название региона')
  const nameKk = optionalLabel(input?.nameKk, 80, 'Название региона')
  const rows = await db.all('SELECT id, name, name_kk FROM regions')
  if (rows.some((row) => sameText(row.name, name) || (nameKk && row.name_kk && sameText(row.name_kk, nameKk)))) fail('Такой регион уже есть', 409)
  const id = crypto.randomUUID()
  await db.run('INSERT INTO regions (id, name, name_kk, created_at) VALUES (?, ?, ?, ?)', id, name, nameKk, new Date().toISOString())
  await ensureRegionalDivisions(id)
  return mustRegion(id)
}

export async function updateRegion(actor, id, input) {
  assertRole(actor, 'super')
  await mustRegion(id)
  const name = cleanLabel(input?.name, 2, 80, 'Название региона')
  const nameKk = optionalLabel(input?.nameKk, 80, 'Название региона')
  const rows = await db.all('SELECT id, name, name_kk FROM regions')
  if (rows.some((row) => row.id !== id && (sameText(row.name, name) || (nameKk && row.name_kk && sameText(row.name_kk, nameKk))))) fail('Такой регион уже есть', 409)
  await db.run('UPDATE regions SET name = ?, name_kk = ? WHERE id = ?', name, nameKk, id)
  await ensureRegionalDivisions(id)
  return mustRegion(id)
}

export async function deleteRegion(actor, id) {
  assertRole(actor, 'super')
  await mustRegion(id)
  const organizations = await count('SELECT COUNT(*) AS n FROM organizations WHERE region_id = ?', id)
  const admins = await count("SELECT COUNT(*) AS n FROM users WHERE role = 'regional' AND region_id = ?", id)
  if (organizations || admins) fail('Сначала удалите организации и администраторов этого региона')
  await db.tx(async (tx) => {
    await tx.run('DELETE FROM districts WHERE region_id = ?', id)
    await tx.run('DELETE FROM regions WHERE id = ?', id)
  })
}

export async function listRegionalAdmins(actor) {
  assertRole(actor, 'super')
  const rows = await db.all(
    `SELECT u.id, u.login, u.display_name, u.display_name_kk, u.region_id, r.name AS region_name, r.name_kk AS region_name_kk
     FROM users u JOIN regions r ON r.id = u.region_id
     WHERE u.role = 'regional'`,
  )
  return rows
    .map((row) => ({
      id: row.id,
      login: row.login,
      displayName: row.display_name || row.login,
      displayNameKk: row.display_name_kk || '',
      regionId: row.region_id,
      regionName: row.region_name,
      regionNameKk: row.region_name_kk || '',
    }))
    .sort((a, b) => a.regionName.localeCompare(b.regionName, 'ru') || a.displayName.localeCompare(b.displayName, 'ru'))
}

export async function createRegionalAdmin(actor, input) {
  assertRole(actor, 'super')
  const region = await mustRegion(input?.regionId)
  const displayName = cleanLabel(input?.displayName, 2, 80, 'Имя')
  const displayNameKk = optionalLabel(input?.displayNameKk, 80, 'Имя')
  return insertUser({
    role: 'regional',
    login: input?.login,
    password: input?.password,
    displayName,
    displayNameKk,
    regionId: region.id,
  })
}

export async function updateRegionalAdmin(actor, id, input) {
  assertRole(actor, 'super')
  const current = await db.get("SELECT id FROM users WHERE id = ? AND role = 'regional'", id)
  if (!current) fail('Администратор не найден', 404)
  const region = await mustRegion(input?.regionId)
  const displayName = cleanLabel(input?.displayName, 2, 80, 'Имя')
  const displayNameKk = optionalLabel(input?.displayNameKk, 80, 'Имя')
  await db.run('UPDATE users SET display_name = ?, display_name_kk = ?, region_id = ? WHERE id = ?', displayName, displayNameKk, region.id, id)
  await setPassword(id, input?.password)
  return profile(id)
}

export async function deleteRegionalAdmin(actor, id) {
  assertRole(actor, 'super')
  const result = await db.run("DELETE FROM users WHERE id = ? AND role = 'regional'", id)
  if (!result.changes) fail('Администратор не найден', 404)
}

export async function listOrganizations(actor) {
  assertRole(actor, 'regional')
  const rows = (await db.all(
    `SELECT o.*, d.name AS district_name, d.name_kk AS district_name_kk
     FROM organizations o
     LEFT JOIN districts d ON d.id = o.district_id
     WHERE o.region_id = ?`,
    actor.regionId,
  )).map(mapOrg)
  const ids = rows.map((org) => org.id)
  const learners = await learnerCounts(ids)
  const marks = ids.map(() => '?').join(',')
  const classRows = ids.length
    ? await db.all(`SELECT organization_id AS id, COUNT(*) AS n FROM classes WHERE organization_id IN (${marks}) GROUP BY organization_id`, ...ids)
    : []
  const adminRows = ids.length
    ? await db.all(`SELECT organization_id AS id, COUNT(*) AS n FROM users WHERE role = 'org' AND organization_id IN (${marks}) GROUP BY organization_id`, ...ids)
    : []
  const classMap = new Map(classRows.map((row) => [row.id, Number(row.n)]))
  const adminMap = new Map(adminRows.map((row) => [row.id, Number(row.n)]))
  return rows
    .map((org) => ({
      ...org,
      classes: classMap.get(org.id) || 0,
      learners: learners.get(org.id) || 0,
      admins: adminMap.get(org.id) || 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

export async function launchTargets(actor) {
  let orgRows
  if (actor?.role === 'super') {
    orgRows = await db.all('SELECT id, name, name_kk FROM organizations ORDER BY name')
  } else if (actor?.role === 'regional') {
    orgRows = await db.all('SELECT id, name, name_kk FROM organizations WHERE region_id = ? ORDER BY name', actor.regionId)
  } else if (actor?.role === 'org') {
    orgRows = await db.all('SELECT id, name, name_kk FROM organizations WHERE id = ?', actor.organizationId)
  } else {
    fail('Недостаточно прав', 403)
  }
  if (!orgRows.length) return []
  const marks = orgRows.map(() => '?').join(',')
  const classes = await db.all(
    `SELECT c.id, c.name, c.grade, c.band, c.organization_id, t.name AS track_name
     FROM classes c
     LEFT JOIN tracks t ON t.id = c.track_id
     WHERE c.organization_id IN (${marks})`,
    ...orgRows.map((org) => org.id),
  )
  return orgRows.map((org) => ({
    id: org.id,
    name: org.name,
    nameKk: org.name_kk || '',
    classes: classes
      .filter((item) => item.organization_id === org.id)
      .map((item) => ({ id: item.id, label: classCaption(item), band: item.band }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label), 'ru')),
  }))
}

export async function listLaunchQuizzes(actor) {
  assertRole(actor, 'super', 'regional', 'org')
  return listSuperQuizzes()
}

export async function quizForRoom(actor, quizId, mode) {
  const priv = mode === 'private'
  if (actor?.role === 'host') {
    if (priv) fail('Недостаточно прав', 403)
    const quiz = await getQuiz(quizId, actor.id)
    if (!quiz) fail('Квиз не найден', 404)
    return quiz
  }
  if (actor?.role === 'super') {
    const quiz = await getQuiz(quizId, actor.id)
    if (!quiz) fail('Квиз не найден', 404)
    return quiz
  }
  if (actor?.role === 'regional' || actor?.role === 'org') {
    if (!priv) fail('Выберите класс')
    const quiz = await getLaunchQuiz(quizId)
    if (!quiz) fail('Квиз не найден', 404)
    return quiz
  }
  fail('Недостаточно прав', 403)
}

export async function privateAudience(actor, organizationId, classId) {
  const targets = await launchTargets(actor)
  const org = targets.find((item) => item.id === organizationId)
  if (!org) fail('Выберите организацию')
  const klass = org.classes.find((item) => item.id === classId)
  if (!klass) fail('Выберите класс')
  return {
    kind: 'private',
    organizationId: org.id,
    classId: klass.id,
    band: klass.band,
    organizationName: org.name,
    organizationNameKk: org.nameKk || '',
    classLabel: klass.label,
  }
}

async function assertUniqueOrg(regionId, name, nameKk, exceptId) {
  const rows = await db.all('SELECT id, name, name_kk FROM organizations WHERE region_id = ?', regionId)
  if (rows.some((row) => row.id !== exceptId && (sameText(row.name, name) || (nameKk && row.name_kk && sameText(row.name_kk, nameKk))))) {
    fail('Такая организация в регионе уже есть', 409)
  }
}

async function assertGroupsFree(orgId, groups) {
  const classes = await db.all('SELECT DISTINCT band FROM classes WHERE organization_id = ?', orgId)
  for (const row of classes) {
    if (!groups[row.band]) fail('Нельзя снять группу, в которой уже есть классы')
  }
  const tracks = await count('SELECT COUNT(*) AS n FROM tracks WHERE organization_id = ?', orgId)
  if (tracks && !groups.students) fail('Нельзя снять группу, в которой уже есть классы')
}

export async function createOrganization(actor, input) {
  assertRole(actor, 'regional')
  const name = cleanLabel(input?.name, 2, 120, 'Название организации')
  const nameKk = optionalLabel(input?.nameKk, 120, 'Название организации')
  const groups = readGroups(input)
  const districtId = await districtInRegion(input?.districtId, actor.regionId)
  await assertUniqueOrg(actor.regionId, name, nameKk)
  const id = crypto.randomUUID()
  await db.run(
    `INSERT INTO organizations (id, region_id, district_id, name, name_kk, grades_1_4, grades_5_9, grades_10_11, students, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    actor.regionId,
    districtId,
    name,
    nameKk,
    ...groupNumbers(groups),
    new Date().toISOString(),
  )
  return mustOrg(id)
}

export async function updateOrganization(actor, id, input) {
  assertRole(actor, 'regional')
  await orgInRegion(id, actor.regionId)
  const name = cleanLabel(input?.name, 2, 120, 'Название организации')
  const nameKk = optionalLabel(input?.nameKk, 120, 'Название организации')
  const groups = readGroups(input)
  const districtId = await districtInRegion(input?.districtId, actor.regionId)
  await assertUniqueOrg(actor.regionId, name, nameKk, id)
  await assertGroupsFree(id, groups)
  await db.run(
    `UPDATE organizations SET district_id = ?, name = ?, name_kk = ?, grades_1_4 = ?, grades_5_9 = ?, grades_10_11 = ?, students = ? WHERE id = ?`,
    districtId,
    name,
    nameKk,
    ...groupNumbers(groups),
    id,
  )
  return mustOrg(id)
}

export async function deleteOrganization(actor, id) {
  assertRole(actor, 'regional')
  await orgInRegion(id, actor.regionId)
  await db.tx(async (tx) => {
    await tx.run(
      `DELETE FROM lesson_attempts WHERE user_id IN (
         SELECT id FROM users WHERE organization_id = ? AND role IN ('org', 'learner')
       )`,
      id,
    )
    await tx.run("DELETE FROM users WHERE organization_id = ? AND role IN ('org', 'learner')", id)
    await tx.run('DELETE FROM classes WHERE organization_id = ?', id)
    await tx.run('DELETE FROM tracks WHERE organization_id = ?', id)
    await tx.run('DELETE FROM organizations WHERE id = ?', id)
  })
}

export async function listOrgAdmins(actor) {
  assertRole(actor, 'regional')
  const rows = await db.all(
    `SELECT u.id, u.login, u.display_name, u.display_name_kk, u.organization_id, o.name AS organization_name, o.name_kk AS organization_name_kk
     FROM users u JOIN organizations o ON o.id = u.organization_id
     WHERE u.role = 'org' AND o.region_id = ?`,
    actor.regionId,
  )
  return rows
    .map((row) => ({
      id: row.id,
      login: row.login,
      displayName: row.display_name || row.login,
      displayNameKk: row.display_name_kk || '',
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      organizationNameKk: row.organization_name_kk || '',
    }))
    .sort((a, b) => a.organizationName.localeCompare(b.organizationName, 'ru') || a.displayName.localeCompare(b.displayName, 'ru'))
}

export async function createOrgAdmin(actor, input) {
  assertRole(actor, 'regional')
  const org = await orgInRegion(input?.organizationId, actor.regionId)
  const displayName = cleanLabel(input?.displayName, 2, 80, 'Имя')
  const displayNameKk = optionalLabel(input?.displayNameKk, 80, 'Имя')
  return insertUser({
    role: 'org',
    login: input?.login,
    password: input?.password,
    displayName,
    displayNameKk,
    organizationId: org.id,
  })
}

export async function updateOrgAdmin(actor, id, input) {
  assertRole(actor, 'regional')
  const current = await db.get(
    `SELECT u.id FROM users u JOIN organizations o ON o.id = u.organization_id
     WHERE u.id = ? AND u.role = 'org' AND o.region_id = ?`,
    id,
    actor.regionId,
  )
  if (!current) fail('Администратор не найден', 404)
  const org = await orgInRegion(input?.organizationId, actor.regionId)
  const displayName = cleanLabel(input?.displayName, 2, 80, 'Имя')
  const displayNameKk = optionalLabel(input?.displayNameKk, 80, 'Имя')
  await db.run('UPDATE users SET display_name = ?, display_name_kk = ?, organization_id = ? WHERE id = ?', displayName, displayNameKk, org.id, id)
  await setPassword(id, input?.password)
  return profile(id)
}

export async function deleteOrgAdmin(actor, id) {
  assertRole(actor, 'regional')
  const current = await db.get(
    `SELECT u.id FROM users u JOIN organizations o ON o.id = u.organization_id
     WHERE u.id = ? AND u.role = 'org' AND o.region_id = ?`,
    id,
    actor.regionId,
  )
  if (!current) fail('Администратор не найден', 404)
  await db.run('DELETE FROM users WHERE id = ?', id)
}

export async function structure(actor) {
  assertRole(actor, 'org')
  const org = await mustOrg(actor.organizationId)
  const classes = await db.all(
    `SELECT c.id, c.name, c.band, c.grade, c.track_id,
            (SELECT COUNT(*) FROM users u WHERE u.role = 'learner' AND u.class_id = c.id) AS learners
     FROM classes c WHERE c.organization_id = ?`,
    org.id,
  )
  const tracks = await db.all('SELECT id, name FROM tracks WHERE organization_id = ?', org.id)
  const mapped = classes.map((row) => ({
    id: row.id,
    name: row.name,
    band: row.band,
    grade: row.grade == null ? null : Number(row.grade),
    trackId: row.track_id,
    learners: Number(row.learners),
  }))
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

async function assertUniqueClass(organizationId, name, scopeSql, scopeParams, exceptId) {
  const rows = await db.all(
    `SELECT id, name FROM classes WHERE organization_id = ? AND ${scopeSql}`,
    organizationId,
    ...scopeParams,
  )
  if (rows.some((row) => row.id !== exceptId && sameText(row.name, name))) fail('Такой класс уже есть', 409)
}

export async function createTrack(actor, input) {
  assertRole(actor, 'org')
  const org = await mustOrg(actor.organizationId)
  if (!org.groups.students) fail('В организации не отмечены студенты')
  const name = cleanLabel(input?.name, 2, 40, 'Название курса')
  const rows = await db.all('SELECT id, name FROM tracks WHERE organization_id = ?', org.id)
  if (rows.some((row) => sameText(row.name, name))) fail('Такой курс уже есть', 409)
  const id = crypto.randomUUID()
  await db.run(
    'INSERT INTO tracks (id, organization_id, name, created_at) VALUES (?, ?, ?, ?)',
    id,
    org.id,
    name,
    new Date().toISOString(),
  )
  return { id, name }
}

export async function updateTrack(actor, id, input) {
  assertRole(actor, 'org')
  const current = await db.get('SELECT id FROM tracks WHERE id = ? AND organization_id = ?', id, actor.organizationId)
  if (!current) fail('Курс не найден', 404)
  const name = cleanLabel(input?.name, 2, 40, 'Название курса')
  const rows = await db.all('SELECT id, name FROM tracks WHERE organization_id = ?', actor.organizationId)
  if (rows.some((row) => row.id !== id && sameText(row.name, name))) fail('Такой курс уже есть', 409)
  await db.run('UPDATE tracks SET name = ? WHERE id = ?', name, id)
  return { id, name }
}

export async function deleteTrack(actor, id) {
  assertRole(actor, 'org')
  const current = await db.get('SELECT id FROM tracks WHERE id = ? AND organization_id = ?', id, actor.organizationId)
  if (!current) fail('Курс не найден', 404)
  const classes = await count('SELECT COUNT(*) AS n FROM classes WHERE track_id = ?', id)
  if (classes) fail('Сначала удалите группы этого курса')
  await db.run('DELETE FROM tracks WHERE id = ?', id)
}

export async function createClass(actor, input) {
  assertRole(actor, 'org')
  const org = await mustOrg(actor.organizationId)
  const name = cleanLabel(input?.name, 1, 20, 'Название класса')
  if (input?.trackId) {
    if (!org.groups.students) fail('В организации не отмечены студенты')
    const track = await db.get('SELECT id FROM tracks WHERE id = ? AND organization_id = ?', input.trackId, org.id)
    if (!track) fail('Курс не найден', 404)
    await assertUniqueClass(org.id, name, 'track_id = ?', [input.trackId])
    const id = crypto.randomUUID()
    await db.run(
      `INSERT INTO classes (id, organization_id, band, grade, track_id, name, created_at)
       VALUES (?, ?, 'students', NULL, ?, ?, ?)`,
      id,
      org.id,
      input.trackId,
      name,
      new Date().toISOString(),
    )
    return { id, name, band: 'students', trackId: input.trackId }
  }
  const grade = Number(input?.grade)
  const band = bandForGrade(grade)
  if (!band) fail('Такой параллели нет')
  if (!org.groups[band.id]) fail('Эта группа в организации не отмечена')
  await assertUniqueClass(org.id, name, 'band = ? AND grade = ?', [band.id, grade])
  const id = crypto.randomUUID()
  await db.run(
    `INSERT INTO classes (id, organization_id, band, grade, track_id, name, created_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    id,
    org.id,
    band.id,
    grade,
    name,
    new Date().toISOString(),
  )
  return { id, name, band: band.id, grade }
}

export async function updateClass(actor, id, input) {
  assertRole(actor, 'org')
  const current = await db.get('SELECT * FROM classes WHERE id = ? AND organization_id = ?', id, actor.organizationId)
  if (!current) fail('Класс не найден', 404)
  const name = cleanLabel(input?.name, 1, 20, 'Название класса')
  if (current.track_id) await assertUniqueClass(actor.organizationId, name, 'track_id = ?', [current.track_id], id)
  else await assertUniqueClass(actor.organizationId, name, 'band = ? AND grade = ?', [current.band, current.grade], id)
  await db.run('UPDATE classes SET name = ? WHERE id = ?', name, id)
  return { id, name }
}

export async function deleteClass(actor, id) {
  assertRole(actor, 'org')
  const current = await db.get('SELECT id FROM classes WHERE id = ? AND organization_id = ?', id, actor.organizationId)
  if (!current) fail('Класс не найден', 404)
  const learners = await count("SELECT COUNT(*) AS n FROM users WHERE role = 'learner' AND class_id = ?", id)
  if (learners) fail('В классе есть тестируемые. Сначала переведите или удалите их')
  await db.run('DELETE FROM classes WHERE id = ?', id)
}

function mapLearner(row) {
  return {
    id: row.id,
    login: row.login,
    displayName: row.display_name || row.login,
    displayNameKk: row.display_name_kk || '',
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
  const search = clean(query.search)
  const where = ["u.role = 'learner'", 'u.organization_id = ?']
  const params = [actor.organizationId]
  if (classId) {
    where.push('u.class_id = ?')
    params.push(classId)
  }
  if (search) {
    where.push('(lower(u.display_name) LIKE lower(?) OR lower(u.display_name_kk) LIKE lower(?) OR lower(u.login) LIKE lower(?))')
    params.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }
  const total = await count(
    `SELECT COUNT(*) AS n FROM users u WHERE ${where.join(' AND ')}`,
    ...params,
  )
  const rows = await db.all(
    `SELECT u.id, u.login, u.display_name, u.display_name_kk, u.class_id, c.name AS class_name, c.grade, c.band, t.name AS track_name
     FROM users u
     JOIN classes c ON c.id = u.class_id
     LEFT JOIN tracks t ON t.id = c.track_id
     WHERE ${where.join(' AND ')}
     ORDER BY c.band, c.grade, t.name, c.name, u.display_name, u.login
     LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset,
  )
  return { learners: rows.map(mapLearner), total, offset, limit }
}

async function orgClasses(organizationId) {
  const rows = await db.all(
    `SELECT c.id, c.band, c.name AS class_name, c.grade, t.name AS track_name
     FROM classes c LEFT JOIN tracks t ON t.id = c.track_id
     WHERE c.organization_id = ?`,
    organizationId,
  )
  return rows.map((row) => ({ ...row, label: classCaption(row) }))
}

function generatePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  let out = ''
  for (const byte of crypto.randomBytes(8)) out += alphabet[byte % alphabet.length]
  return out
}

export async function learnersTemplate() {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Тестируемые')
  sheet.columns = [
    { header: 'Класс', width: 18 },
    { header: 'Имя', width: 32 },
    { header: 'Логин', width: 22 },
    { header: 'Пароль', width: 18 },
  ]
  sheet.addRow(['5а', 'Арман Серіков', 'arman.serikov', 'qwe123'])
  sheet.addRow(['5а', 'Аида Нурланова', 'aida.n', ''])
  sheet.getRow(1).font = { bold: true }
  return workbook.xlsx.writeBuffer()
}

export async function importLearners(actor, buffer) {
  assertRole(actor, 'org')
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || [])
  if (!bytes.length) fail('Файл пустой')
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(bytes)
  } catch {
    fail('Не удалось прочитать файл. Нужен Excel .xlsx')
  }
  const sheet = workbook.worksheets[0]
  if (!sheet) fail('В файле нет листа')

  const org = await mustOrg(actor.organizationId)
  const classes = (await orgClasses(actor.organizationId)).filter((item) => org.groups[item.band])
  const byName = new Map()
  for (const item of classes) {
    for (const key of [item.class_name, item.label]) {
      const lower = key.toLowerCase()
      if (!byName.has(lower)) byName.set(lower, [])
      byName.get(lower).push(item)
    }
  }

  const rows = []
  const errors = []
  const seenLogins = new Set()
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const className = cellText(row.getCell(1).value)
    const displayName = cellText(row.getCell(2).value)
    const login = cellText(row.getCell(3).value)
    const password = cellText(row.getCell(4).value)
    if (!className && !displayName && !login) return
    if (row.number === 1 && /^класс$/i.test(className)) return
    const label = `Строка ${row.number}`
    const matches = byName.get(className.toLowerCase()) || []
    if (!matches.length) {
      errors.push(`${label}: класс «${className}» не найден`)
      return
    }
    if (matches.length > 1) {
      errors.push(`${label}: класс «${className}» есть в нескольких параллелях, укажите «${matches[0].label}»`)
      return
    }
    if (displayName.length < 2 || displayName.length > 80) {
      errors.push(`${label}: имя от 2 до 80 символов`)
      return
    }
    let account
    try {
      account = normalizeAccount({ login, password: password || generatePassword() })
    } catch (error) {
      errors.push(`${label}: ${error.message}`)
      return
    }
    const lower = account.login.toLowerCase()
    if (seenLogins.has(lower)) {
      errors.push(`${label}: логин «${account.login}» повторяется в файле`)
      return
    }
    seenLogins.add(lower)
    rows.push({ klass: matches[0], displayName, login: account.login, password: account.password })
  })
  if (rows.length > 5000) fail('За один раз можно загрузить до 5000 тестируемых')
  if (!rows.length) {
    if (errors.length) return { created: 0, learners: [], errors }
    fail('В файле нет тестируемых')
  }

  const logins = rows.map((row) => row.login.toLowerCase())
  const taken = new Set()
  for (let start = 0; start < logins.length; start += 500) {
    const chunk = logins.slice(start, start + 500)
    const marks = chunk.map(() => '?').join(',')
    const found = await db.all(`SELECT login FROM users WHERE lower(login) IN (${marks})`, ...chunk)
    for (const item of found) taken.add(String(item.login).toLowerCase())
  }
  const fresh = []
  for (const row of rows) {
    if (taken.has(row.login.toLowerCase())) errors.push(`Логин «${row.login}» уже занят`)
    else fresh.push(row)
  }

  const created = []
  const now = new Date().toISOString()
  for (let start = 0; start < fresh.length; start += 100) {
    const chunk = fresh.slice(start, start + 100)
    const hashes = await Promise.all(chunk.map((row) => hashPassword(row.password)))
    const values = []
    const params = []
    chunk.forEach((row, index) => {
      const id = crypto.randomUUID()
      values.push('(?, ?, ?, ?, ?, ?, ?, ?, ?)')
      params.push(id, row.login, hashes[index], now, 'learner', row.displayName, '', actor.organizationId, row.klass.id)
      created.push({ id, displayName: row.displayName, login: row.login, password: row.password, classLabel: row.klass.label })
    })
    try {
      await db.run(
        `INSERT INTO users (id, login, password_hash, created_at, role, display_name, display_name_kk, organization_id, class_id)
         VALUES ${values.join(', ')}`,
        ...params,
      )
    } catch (error) {
      if (!isUnique(error)) throw error
      // Кто-то занял логин между проверкой и вставкой: пачку повторяем по одному.
      created.splice(created.length - chunk.length, chunk.length)
      for (const [index, row] of chunk.entries()) {
        const id = crypto.randomUUID()
        try {
          await db.run(
            `INSERT INTO users (id, login, password_hash, created_at, role, display_name, display_name_kk, organization_id, class_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            id, row.login, hashes[index], now, 'learner', row.displayName, '', actor.organizationId, row.klass.id,
          )
          created.push({ id, displayName: row.displayName, login: row.login, password: row.password, classLabel: row.klass.label })
        } catch (inner) {
          if (!isUnique(inner)) throw inner
          errors.push(`Логин «${row.login}» уже занят`)
        }
      }
    }
  }
  return { created: created.length, learners: created, errors }
}

async function classInOrg(classId, organizationId) {
  const row = await db.get(
    `SELECT c.id, c.band, c.name AS class_name, c.grade, t.name AS track_name
     FROM classes c LEFT JOIN tracks t ON t.id = c.track_id
     WHERE c.id = ? AND c.organization_id = ?`,
    classId,
    organizationId,
  )
  if (!row) fail('Класс не найден', 404)
  const org = await mustOrg(organizationId)
  if (!org.groups[row.band]) fail('Эта группа в организации не отмечена')
  return row
}

export async function createLearner(actor, input) {
  assertRole(actor, 'org')
  const klass = await classInOrg(input?.classId, actor.organizationId)
  const displayName = cleanLabel(input?.displayName, 2, 80, 'Имя')
  const displayNameKk = optionalLabel(input?.displayNameKk, 80, 'Имя')
  const user = await insertUser({
    role: 'learner',
    login: input?.login,
    password: input?.password,
    displayName,
    displayNameKk,
    organizationId: actor.organizationId,
    classId: klass.id,
  })
  return { ...user, classLabel: classCaption(klass) }
}

export async function updateLearner(actor, id, input) {
  assertRole(actor, 'org')
  const current = await db.get(
    "SELECT id FROM users WHERE id = ? AND role = 'learner' AND organization_id = ?",
    id,
    actor.organizationId,
  )
  if (!current) fail('Тестируемый не найден', 404)
  const klass = await classInOrg(input?.classId, actor.organizationId)
  const displayName = cleanLabel(input?.displayName, 2, 80, 'Имя')
  const displayNameKk = optionalLabel(input?.displayNameKk, 80, 'Имя')
  await db.run('UPDATE users SET display_name = ?, display_name_kk = ?, class_id = ? WHERE id = ?', displayName, displayNameKk, klass.id, id)
  await setPassword(id, input?.password)
  const user = await profile(id)
  return { ...user, classLabel: classCaption(klass) }
}

export async function deleteLearner(actor, id) {
  assertRole(actor, 'org')
  const result = await db.run(
    "DELETE FROM users WHERE id = ? AND role = 'learner' AND organization_id = ?",
    id,
    actor.organizationId,
  )
  if (!result.changes) fail('Тестируемый не найден', 404)
}
