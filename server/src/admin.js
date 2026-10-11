import crypto from 'node:crypto'
import { db } from './db.js'
import { normalizeAccount } from './domain.js'
import { hashPassword } from './passwords.js'

export const BANDS = [
  { id: 'grades_1_4', label: '1–4 классы', grades: [1, 2, 3, 4] },
  { id: 'grades_5_9', label: '5–9 классы', grades: [5, 6, 7, 8, 9] },
  { id: 'grades_10_11', label: '10–11 классы', grades: [10, 11] },
  { id: 'students', label: 'Студенты', grades: [] },
]

const GROUP_KEYS = BANDS.map((band) => band.id)

function fail(message, status = 400) {
  const error = new Error(message)
  error.status = status
  throw error
}

function clean(value) {
  return String(value || '').replace(/[\u0000-\u001F]/g, '').trim().replace(/\s+/g, ' ')
}

function cleanLabel(value, min, max, label) {
  const text = clean(value)
  if (text.length < min || text.length > max) fail(`${label}: от ${min} до ${max} символов`)
  return text
}

function sameText(left, right) {
  return left.localeCompare(right, 'ru', { sensitivity: 'accent' }) === 0
}

function isUnique(error) {
  return error?.code === '23505' || String(error?.message || '').includes('UNIQUE')
}

async function count(sql, ...params) {
  const row = await db.get(sql, ...params)
  return Number(row?.n || 0)
}

function readPassword(value) {
  if (value == null || String(value) === '') return null
  const pass = String(value)
  if (pass.length < 6 || pass.length > 72) fail('Пароль от 6 до 72 символов')
  return pass
}

function readGroups(input) {
  const source = input?.groups || input || {}
  const groups = {}
  for (const key of GROUP_KEYS) groups[key] = Boolean(source[key])
  if (!GROUP_KEYS.some((key) => groups[key])) fail('Отметьте хотя бы одну группу')
  return groups
}

function bandForGrade(grade) {
  return BANDS.find((band) => band.grades.includes(grade)) || null
}

function mapOrg(row) {
  return {
    id: row.id,
    regionId: row.region_id,
    name: row.name,
    groups: {
      grades_1_4: Boolean(row.grades_1_4),
      grades_5_9: Boolean(row.grades_5_9),
      grades_10_11: Boolean(row.grades_10_11),
      students: Boolean(row.students),
    },
    createdAt: row.created_at,
  }
}

function classCaption(row) {
  if (!row) return null
  const name = row.class_name || row.name
  if (row.band === 'students') return `${name} · ${row.track_name || row.trackName || 'Студенты'}`
  return `${name} · ${row.grade} класс`
}

export async function profile(id) {
  const row = await db.get(
    `SELECT u.id, u.login, u.role, u.display_name, u.region_id, u.organization_id, u.class_id,
            r.name AS region_name, o.name AS organization_name,
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

let boot
export function bootAdmin() {
  if (!boot) {
    boot = (async () => {
      const user = await ensureSuperAdmin()
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
  const existing = await db.get("SELECT id FROM users WHERE role = 'super' LIMIT 1")
  if (existing) return profile(existing.id)
  const login = process.env.SUPER_LOGIN || 'super'
  const password = process.env.SUPER_PASSWORD || 'super12345'
  const account = normalizeAccount({ login, password })
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
    'Суперглавный',
  )
  return profile(id)
}

function assertRole(actor, ...roles) {
  if (!actor || !roles.includes(actor.role)) fail('Недостаточно прав', 403)
}

async function insertUser({ role, login, password, displayName, regionId, organizationId, classId }) {
  const account = normalizeAccount({ login, password })
  const id = crypto.randomUUID()
  const passwordHash = await hashPassword(account.password)
  try {
    await db.run(
      `INSERT INTO users (id, login, password_hash, created_at, role, display_name, region_id, organization_id, class_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      account.login,
      passwordHash,
      new Date().toISOString(),
      role,
      displayName,
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

async function mustRegion(id) {
  const row = await db.get('SELECT id, name, created_at FROM regions WHERE id = ?', id)
  if (!row) fail('Регион не найден', 404)
  return { id: row.id, name: row.name, createdAt: row.created_at }
}

async function mustOrg(id) {
  const row = await db.get('SELECT * FROM organizations WHERE id = ?', id)
  if (!row) fail('Организация не найдена', 404)
  return mapOrg(row)
}

async function orgInRegion(id, regionId) {
  const org = await mustOrg(id)
  if (org.regionId !== regionId) fail('Организация не найдена', 404)
  return org
}

function chart(caption, items, order = 'value') {
  const list = items.filter((item) => item.label)
  if (order === 'given') return { caption, items: list }
  return {
    caption,
    items: list.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'ru')),
  }
}

async function learnerCounts(orgIds) {
  if (!orgIds.length) return new Map()
  const marks = orgIds.map(() => '?').join(',')
  const rows = await db.all(
    `SELECT organization_id AS id, COUNT(*) AS n FROM users
     WHERE role = 'learner' AND organization_id IN (${marks}) GROUP BY organization_id`,
    ...orgIds,
  )
  return new Map(rows.map((row) => [row.id, Number(row.n)]))
}

async function composition(orgIds) {
  if (!orgIds.length) return []
  const marks = orgIds.map(() => '?').join(',')
  const rows = await db.all(
    `SELECT c.id, c.name, c.band, c.grade, c.organization_id, t.name AS track_name,
            (SELECT COUNT(*) FROM users u WHERE u.role = 'learner' AND u.class_id = c.id) AS learners
     FROM classes c
     LEFT JOIN tracks t ON t.id = c.track_id
     WHERE c.organization_id IN (${marks})`,
    ...orgIds,
  )
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    band: row.band,
    grade: row.grade == null ? null : Number(row.grade),
    organizationId: row.organization_id,
    trackName: row.track_name,
    learners: Number(row.learners),
  }))
}

function bandItems(classes, orgs) {
  const enabled = new Set()
  for (const org of orgs) {
    for (const key of GROUP_KEYS) if (org.groups[key]) enabled.add(key)
  }
  const totals = new Map(BANDS.map((band) => [band.id, 0]))
  for (const item of classes) totals.set(item.band, (totals.get(item.band) || 0) + item.learners)
  return BANDS.filter((band) => enabled.has(band.id) || totals.get(band.id) > 0).map((band) => ({
    key: band.id,
    label: band.label,
    value: totals.get(band.id) || 0,
  }))
}

function gradeItems(classes) {
  const buckets = new Map()
  for (const item of classes) {
    const students = item.band === 'students'
    const key = students ? `track:${item.trackName}` : `grade:${item.grade}`
    const label = students ? (item.trackName || 'Студенты') : `${item.grade} класс`
    const current = buckets.get(key) || { key, label, value: 0, sort: students ? 100 : item.grade }
    current.value += item.learners
    buckets.set(key, current)
  }
  return [...buckets.values()]
    .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, 'ru'))
    .map(({ key, label, value }) => ({ key, label, value }))
}

export async function dashboard(actor) {
  if (actor.role === 'super') return superDashboard()
  if (actor.role === 'regional') return regionDashboard(actor.regionId)
  if (actor.role === 'org') return orgDashboard(actor.organizationId)
  fail('Недостаточно прав', 403)
}

async function superDashboard() {
  const regions = await listRegions({ role: 'super' })
  const organizations = await count('SELECT COUNT(*) AS n FROM organizations')
  const admins = await count("SELECT COUNT(*) AS n FROM users WHERE role = 'regional'")
  const learners = regions.reduce((sum, region) => sum + region.learners, 0)
  return {
    scope: 'platform',
    note: 'Сводка по всем регионам. Результаты тестов появятся здесь вместе с темами.',
    cards: [
      { label: 'Регионов', value: regions.length },
      { label: 'Администраторов', value: admins },
      { label: 'Организаций', value: organizations },
      { label: 'Тестируемых', value: learners },
    ],
    charts: [
      chart('Тестируемые по регионам', regions.map((region) => ({ key: region.id, label: region.name, value: region.learners }))),
      chart('Организации по регионам', regions.map((region) => ({ key: region.id, label: region.name, value: region.organizations }))),
    ],
    table: {
      caption: 'Регионы',
      columns: ['Регион', 'Организации', 'Админы области', 'Тестируемые'],
      rows: regions.map((region) => ({
        key: region.id,
        cells: [region.name, region.organizations, region.admins, region.learners],
      })),
    },
  }
}

async function regionDashboard(regionId) {
  const region = await mustRegion(regionId)
  const orgs = (await db.all('SELECT * FROM organizations WHERE region_id = ?', regionId)).map(mapOrg)
  const ids = orgs.map((org) => org.id)
  const marks = ids.map(() => '?').join(',')
  const admins = ids.length
    ? await count(`SELECT COUNT(*) AS n FROM users WHERE role = 'org' AND organization_id IN (${marks})`, ...ids)
    : 0
  const classes = ids.length
    ? await count(`SELECT COUNT(*) AS n FROM classes WHERE organization_id IN (${marks})`, ...ids)
    : 0
  const learnersByOrg = await learnerCounts(ids)
  const learners = [...learnersByOrg.values()].reduce((sum, value) => sum + value, 0)
  const rows = await composition(ids)
  const orgRows = orgs
    .map((org) => ({
      id: org.id,
      name: org.name,
      classes: rows.filter((item) => item.organizationId === org.id).length,
      learners: learnersByOrg.get(org.id) || 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  const adminRows = ids.length
    ? await db.all(
      `SELECT organization_id AS id, COUNT(*) AS n FROM users WHERE role = 'org' AND organization_id IN (${marks}) GROUP BY organization_id`,
      ...ids,
    )
    : []
  const adminByOrg = new Map(adminRows.map((row) => [row.id, Number(row.n)]))
  return {
    scope: 'region',
    title: region.name,
    note: 'Вся статистика региона. Результаты тестов появятся здесь вместе с темами.',
    cards: [
      { label: 'Организаций', value: orgs.length },
      { label: 'Администраторов', value: admins },
      { label: 'Классов', value: classes },
      { label: 'Тестируемых', value: learners },
    ],
    charts: [
      chart('Тестируемые по организациям', orgRows.map((org) => ({ key: org.id, label: org.name, value: org.learners }))),
      chart('Тестируемые по группам', bandItems(rows, orgs), 'given'),
      chart('Тестируемые по параллелям', gradeItems(rows), 'given'),
    ],
    table: {
      caption: 'Организации',
      columns: ['Организация', 'Классы', 'Тестируемые', 'Админы'],
      rows: orgRows.map((org) => ({
        key: org.id,
        cells: [org.name, org.classes, org.learners, adminByOrg.get(org.id) || 0],
      })),
    },
  }
}

async function orgDashboard(organizationId) {
  const org = await mustOrg(organizationId)
  const rows = await composition([org.id])
  const learners = rows.reduce((sum, item) => sum + item.learners, 0)
  const admins = await count("SELECT COUNT(*) AS n FROM users WHERE role = 'org' AND organization_id = ?", org.id)
  const classRows = [...rows].sort((a, b) => classCaption(a).localeCompare(classCaption(b), 'ru'))
  return {
    scope: 'organization',
    title: org.name,
    note: 'Вся статистика организации. Результаты тестов появятся здесь вместе с темами.',
    cards: [
      { label: 'Классов', value: rows.length },
      { label: 'Тестируемых', value: learners },
      { label: 'Групп', value: GROUP_KEYS.filter((key) => org.groups[key]).length },
      { label: 'Администраторов', value: admins },
    ],
    charts: [
      chart('Тестируемые по классам', classRows.map((item) => ({ key: item.id, label: item.name, value: item.learners }))),
      chart('Тестируемые по группам', bandItems(rows, [org]), 'given'),
      chart('Тестируемые по параллелям', gradeItems(rows), 'given'),
    ],
    table: {
      caption: 'Классы',
      columns: ['Класс', 'Параллель', 'Тестируемые'],
      rows: classRows.map((item) => ({
        key: item.id,
        cells: [item.name, item.band === 'students' ? (item.trackName || 'Студенты') : `${item.grade} класс`, item.learners],
      })),
    },
  }
}

export async function listRegions(actor) {
  assertRole(actor, 'super')
  const regions = await db.all('SELECT id, name, created_at FROM regions')
  const result = []
  for (const region of regions) {
    const organizations = await count('SELECT COUNT(*) AS n FROM organizations WHERE region_id = ?', region.id)
    const admins = await count("SELECT COUNT(*) AS n FROM users WHERE role = 'regional' AND region_id = ?", region.id)
    const learners = await count(
      `SELECT COUNT(*) AS n FROM users u
       JOIN organizations o ON o.id = u.organization_id
       WHERE u.role = 'learner' AND o.region_id = ?`,
      region.id,
    )
    result.push({ id: region.id, name: region.name, createdAt: region.created_at, organizations, admins, learners })
  }
  return result.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

export async function createRegion(actor, input) {
  assertRole(actor, 'super')
  const name = cleanLabel(input?.name, 2, 80, 'Название региона')
  const rows = await db.all('SELECT id, name FROM regions')
  if (rows.some((row) => sameText(row.name, name))) fail('Такой регион уже есть', 409)
  const id = crypto.randomUUID()
  await db.run('INSERT INTO regions (id, name, created_at) VALUES (?, ?, ?)', id, name, new Date().toISOString())
  return mustRegion(id)
}

export async function updateRegion(actor, id, input) {
  assertRole(actor, 'super')
  await mustRegion(id)
  const name = cleanLabel(input?.name, 2, 80, 'Название региона')
  const rows = await db.all('SELECT id, name FROM regions')
  if (rows.some((row) => row.id !== id && sameText(row.name, name))) fail('Такой регион уже есть', 409)
  await db.run('UPDATE regions SET name = ? WHERE id = ?', name, id)
  return mustRegion(id)
}

export async function deleteRegion(actor, id) {
  assertRole(actor, 'super')
  await mustRegion(id)
  const organizations = await count('SELECT COUNT(*) AS n FROM organizations WHERE region_id = ?', id)
  const admins = await count("SELECT COUNT(*) AS n FROM users WHERE role = 'regional' AND region_id = ?", id)
  if (organizations || admins) fail('Сначала удалите организации и администраторов этого региона')
  await db.run('DELETE FROM regions WHERE id = ?', id)
}

export async function listRegionalAdmins(actor) {
  assertRole(actor, 'super')
  const rows = await db.all(
    `SELECT u.id, u.login, u.display_name, u.region_id, r.name AS region_name
     FROM users u JOIN regions r ON r.id = u.region_id
     WHERE u.role = 'regional'`,
  )
  return rows
    .map((row) => ({
      id: row.id,
      login: row.login,
      displayName: row.display_name || row.login,
      regionId: row.region_id,
      regionName: row.region_name,
    }))
    .sort((a, b) => a.regionName.localeCompare(b.regionName, 'ru') || a.displayName.localeCompare(b.displayName, 'ru'))
}

export async function createRegionalAdmin(actor, input) {
  assertRole(actor, 'super')
  const region = await mustRegion(input?.regionId)
  const displayName = cleanLabel(input?.displayName, 2, 80, 'Имя')
  return insertUser({
    role: 'regional',
    login: input?.login,
    password: input?.password,
    displayName,
    regionId: region.id,
  })
}

export async function updateRegionalAdmin(actor, id, input) {
  assertRole(actor, 'super')
  const current = await db.get("SELECT id FROM users WHERE id = ? AND role = 'regional'", id)
  if (!current) fail('Администратор не найден', 404)
  const region = await mustRegion(input?.regionId)
  const displayName = cleanLabel(input?.displayName, 2, 80, 'Имя')
  await db.run('UPDATE users SET display_name = ?, region_id = ? WHERE id = ?', displayName, region.id, id)
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
  const rows = (await db.all('SELECT * FROM organizations WHERE region_id = ?', actor.regionId)).map(mapOrg)
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

async function assertUniqueOrg(regionId, name, exceptId) {
  const rows = await db.all('SELECT id, name FROM organizations WHERE region_id = ?', regionId)
  if (rows.some((row) => row.id !== exceptId && sameText(row.name, name))) fail('Такая организация в регионе уже есть', 409)
}

async function assertGroupsFree(orgId, groups) {
  const classes = await db.all('SELECT DISTINCT band FROM classes WHERE organization_id = ?', orgId)
  for (const row of classes) {
    if (!groups[row.band]) fail('Нельзя снять группу, в которой уже есть классы')
  }
  const tracks = await count('SELECT COUNT(*) AS n FROM tracks WHERE organization_id = ?', orgId)
  if (tracks && !groups.students) fail('Нельзя снять группу, в которой уже есть классы')
}

function groupNumbers(groups) {
  return GROUP_KEYS.map((key) => (groups[key] ? 1 : 0))
}

export async function createOrganization(actor, input) {
  assertRole(actor, 'regional')
  const name = cleanLabel(input?.name, 2, 120, 'Название организации')
  const groups = readGroups(input)
  await assertUniqueOrg(actor.regionId, name)
  const id = crypto.randomUUID()
  await db.run(
    `INSERT INTO organizations (id, region_id, name, grades_1_4, grades_5_9, grades_10_11, students, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    actor.regionId,
    name,
    ...groupNumbers(groups),
    new Date().toISOString(),
  )
  return mustOrg(id)
}

export async function updateOrganization(actor, id, input) {
  assertRole(actor, 'regional')
  await orgInRegion(id, actor.regionId)
  const name = cleanLabel(input?.name, 2, 120, 'Название организации')
  const groups = readGroups(input)
  await assertUniqueOrg(actor.regionId, name, id)
  await assertGroupsFree(id, groups)
  await db.run(
    `UPDATE organizations SET name = ?, grades_1_4 = ?, grades_5_9 = ?, grades_10_11 = ?, students = ? WHERE id = ?`,
    name,
    ...groupNumbers(groups),
    id,
  )
  return mustOrg(id)
}

export async function deleteOrganization(actor, id) {
  assertRole(actor, 'regional')
  await orgInRegion(id, actor.regionId)
  const admins = await count("SELECT COUNT(*) AS n FROM users WHERE role = 'org' AND organization_id = ?", id)
  const classes = await count('SELECT COUNT(*) AS n FROM classes WHERE organization_id = ?', id)
  const tracks = await count('SELECT COUNT(*) AS n FROM tracks WHERE organization_id = ?', id)
  const learners = await count("SELECT COUNT(*) AS n FROM users WHERE role = 'learner' AND organization_id = ?", id)
  if (admins || classes || tracks || learners) fail('Сначала удалите администраторов, классы и тестируемых')
  await db.run('DELETE FROM organizations WHERE id = ?', id)
}

export async function listOrgAdmins(actor) {
  assertRole(actor, 'regional')
  const rows = await db.all(
    `SELECT u.id, u.login, u.display_name, u.organization_id, o.name AS organization_name
     FROM users u JOIN organizations o ON o.id = u.organization_id
     WHERE u.role = 'org' AND o.region_id = ?`,
    actor.regionId,
  )
  return rows
    .map((row) => ({
      id: row.id,
      login: row.login,
      displayName: row.display_name || row.login,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
    }))
    .sort((a, b) => a.organizationName.localeCompare(b.organizationName, 'ru') || a.displayName.localeCompare(b.displayName, 'ru'))
}

export async function createOrgAdmin(actor, input) {
  assertRole(actor, 'regional')
  const org = await orgInRegion(input?.organizationId, actor.regionId)
  const displayName = cleanLabel(input?.displayName, 2, 80, 'Имя')
  return insertUser({
    role: 'org',
    login: input?.login,
    password: input?.password,
    displayName,
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
  await db.run('UPDATE users SET display_name = ?, organization_id = ? WHERE id = ?', displayName, org.id, id)
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
    where.push('(lower(u.display_name) LIKE lower(?) OR lower(u.login) LIKE lower(?))')
    params.push(`%${search}%`, `%${search}%`)
  }
  const total = await count(
    `SELECT COUNT(*) AS n FROM users u WHERE ${where.join(' AND ')}`,
    ...params,
  )
  const rows = await db.all(
    `SELECT u.id, u.login, u.display_name, u.class_id, c.name AS class_name, c.grade, c.band, t.name AS track_name
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
  sheet.addRow(['5а', 'Арман Сериков', 'arman.serikov', 'qwe123'])
  sheet.addRow(['5а', 'Аида Нурланова', 'aida.n', ''])
  sheet.getRow(1).font = { bold: true }
  return workbook.xlsx.writeBuffer()
}

function cellText(value) {
  if (value == null) return ''
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return clean(value.richText.map((part) => part.text || '').join(''))
    if (value.result != null) return cellText(value.result)
    if (typeof value.text === 'string') return clean(value.text)
    return ''
  }
  return clean(value)
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
      values.push('(?, ?, ?, ?, ?, ?, ?, ?)')
      params.push(id, row.login, hashes[index], now, 'learner', row.displayName, actor.organizationId, row.klass.id)
      created.push({ id, displayName: row.displayName, login: row.login, password: row.password, classLabel: row.klass.label })
    })
    try {
      await db.run(
        `INSERT INTO users (id, login, password_hash, created_at, role, display_name, organization_id, class_id)
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
            `INSERT INTO users (id, login, password_hash, created_at, role, display_name, organization_id, class_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            id, row.login, hashes[index], now, 'learner', row.displayName, actor.organizationId, row.klass.id,
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
  const user = await insertUser({
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
  const current = await db.get(
    "SELECT id FROM users WHERE id = ? AND role = 'learner' AND organization_id = ?",
    id,
    actor.organizationId,
  )
  if (!current) fail('Тестируемый не найден', 404)
  const klass = await classInOrg(input?.classId, actor.organizationId)
  const displayName = cleanLabel(input?.displayName, 2, 80, 'Имя')
  await db.run('UPDATE users SET display_name = ?, class_id = ? WHERE id = ?', displayName, klass.id, id)
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
