import crypto from 'node:crypto'
import { assertRole } from './domain/access.js'
import { generatePassword, normalizeAccount, readPassword } from './domain/accounts.js'
import { fail } from './domain/errors.js'
import { BANDS, bandForGrade, classCaption, GROUP_KEYS, readGroups } from './domain/structure.js'
import { cleanLabel, cleanText, sameText } from './domain/text.js'
import { config } from './infrastructure/config.js'
import { isUniqueViolation } from './infrastructure/db/index.js'
import { hashPassword } from './infrastructure/passwords.js'
import * as classesRepo from './repositories/classes.js'
import * as organizationsRepo from './repositories/organizations.js'
import * as regionsRepo from './repositories/regions.js'
import * as tracksRepo from './repositories/tracks.js'
import * as usersRepo from './repositories/users.js'

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

async function insertUser({ role, login, password, displayName, regionId, organizationId, classId }) {
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
    if (isUniqueViolation(error)) fail('Такой логин уже занят', 409)
    throw error
  }
  return profile(id)
}

async function setPassword(id, password) {
  const next = readPassword(password)
  if (!next) return
  await usersRepo.updatePasswordHash(id, await hashPassword(next))
}

async function mustRegion(id) {
  const region = await regionsRepo.findRegion(id)
  if (!region) fail('Регион не найден', 404)
  return region
}

async function mustOrg(id) {
  const org = await organizationsRepo.findOrganization(id)
  if (!org) fail('Организация не найдена', 404)
  return org
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
  const organizations = await organizationsRepo.countOrganizations()
  const admins = await usersRepo.countRegionalAdmins()
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
  const orgs = await organizationsRepo.listOrganizations(regionId)
  const ids = orgs.map((org) => org.id)
  const admins = await usersRepo.countOrgAdminsIn(ids)
  const classes = await classesRepo.countClassesIn(ids)
  const learnersByOrg = await usersRepo.learnerCountsByOrganization(ids)
  const learners = [...learnersByOrg.values()].reduce((sum, value) => sum + value, 0)
  const rows = await classesRepo.listClassesWithLearners(ids)
  const orgRows = orgs
    .map((org) => ({
      id: org.id,
      name: org.name,
      classes: rows.filter((item) => item.organizationId === org.id).length,
      learners: learnersByOrg.get(org.id) || 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  const adminByOrg = await usersRepo.orgAdminCountsByOrganization(ids)
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
  const rows = await classesRepo.listClassesWithLearners([org.id])
  const learners = rows.reduce((sum, item) => sum + item.learners, 0)
  const admins = await usersRepo.countOrgAdmins(org.id)
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
  const regions = await regionsRepo.listRegions()
  const result = []
  for (const region of regions) {
    const organizations = await organizationsRepo.countOrganizationsInRegion(region.id)
    const admins = await usersRepo.countRegionalAdminsInRegion(region.id)
    const learners = await usersRepo.countLearnersInRegion(region.id)
    result.push({ id: region.id, name: region.name, createdAt: region.createdAt, organizations, admins, learners })
  }
  return result.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

export async function createRegion(actor, input) {
  assertRole(actor, 'super')
  const name = cleanLabel(input?.name, 2, 80, 'Название региона')
  const rows = await regionsRepo.listRegionNames()
  if (rows.some((row) => sameText(row.name, name))) fail('Такой регион уже есть', 409)
  const id = crypto.randomUUID()
  await regionsRepo.insertRegion({ id, name, createdAt: new Date().toISOString() })
  return mustRegion(id)
}

export async function updateRegion(actor, id, input) {
  assertRole(actor, 'super')
  await mustRegion(id)
  const name = cleanLabel(input?.name, 2, 80, 'Название региона')
  const rows = await regionsRepo.listRegionNames()
  if (rows.some((row) => row.id !== id && sameText(row.name, name))) fail('Такой регион уже есть', 409)
  await regionsRepo.renameRegion(id, name)
  return mustRegion(id)
}

export async function deleteRegion(actor, id) {
  assertRole(actor, 'super')
  await mustRegion(id)
  const organizations = await organizationsRepo.countOrganizationsInRegion(id)
  const admins = await usersRepo.countRegionalAdminsInRegion(id)
  if (organizations || admins) fail('Сначала удалите организации и администраторов этого региона')
  await regionsRepo.deleteRegion(id)
}

export async function listRegionalAdmins(actor) {
  assertRole(actor, 'super')
  const rows = await usersRepo.listRegionalAdmins()
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
  const current = await usersRepo.findRegionalAdmin(id)
  if (!current) fail('Администратор не найден', 404)
  const region = await mustRegion(input?.regionId)
  const displayName = cleanLabel(input?.displayName, 2, 80, 'Имя')
  await usersRepo.updateRegionalAdmin(id, { displayName, regionId: region.id })
  await setPassword(id, input?.password)
  return profile(id)
}

export async function deleteRegionalAdmin(actor, id) {
  assertRole(actor, 'super')
  const changes = await usersRepo.deleteRegionalAdmin(id)
  if (!changes) fail('Администратор не найден', 404)
}

export async function listOrganizations(actor) {
  assertRole(actor, 'regional')
  const rows = await organizationsRepo.listOrganizations(actor.regionId)
  const ids = rows.map((org) => org.id)
  const learners = await usersRepo.learnerCountsByOrganization(ids)
  const classMap = await classesRepo.classCountsByOrganization(ids)
  const adminMap = await usersRepo.orgAdminCountsByOrganization(ids)
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
  const rows = await organizationsRepo.listOrganizationNames(regionId)
  if (rows.some((row) => row.id !== exceptId && sameText(row.name, name))) fail('Такая организация в регионе уже есть', 409)
}

async function assertGroupsFree(orgId, groups) {
  const classes = await classesRepo.listBands(orgId)
  for (const row of classes) {
    if (!groups[row.band]) fail('Нельзя снять группу, в которой уже есть классы')
  }
  const tracks = await tracksRepo.countTracks(orgId)
  if (tracks && !groups.students) fail('Нельзя снять группу, в которой уже есть классы')
}

export async function createOrganization(actor, input) {
  assertRole(actor, 'regional')
  const name = cleanLabel(input?.name, 2, 120, 'Название организации')
  const groups = readGroups(input)
  await assertUniqueOrg(actor.regionId, name)
  const id = crypto.randomUUID()
  await organizationsRepo.insertOrganization({ id, regionId: actor.regionId, name, groups, createdAt: new Date().toISOString() })
  return mustOrg(id)
}

export async function updateOrganization(actor, id, input) {
  assertRole(actor, 'regional')
  await orgInRegion(id, actor.regionId)
  const name = cleanLabel(input?.name, 2, 120, 'Название организации')
  const groups = readGroups(input)
  await assertUniqueOrg(actor.regionId, name, id)
  await assertGroupsFree(id, groups)
  await organizationsRepo.updateOrganization(id, { name, groups })
  return mustOrg(id)
}

export async function deleteOrganization(actor, id) {
  assertRole(actor, 'regional')
  await orgInRegion(id, actor.regionId)
  const admins = await usersRepo.countOrgAdmins(id)
  const classes = await classesRepo.countClasses(id)
  const tracks = await tracksRepo.countTracks(id)
  const learners = await usersRepo.countLearnersInOrganization(id)
  if (admins || classes || tracks || learners) fail('Сначала удалите администраторов, классы и тестируемых')
  await organizationsRepo.deleteOrganization(id)
}

export async function listOrgAdmins(actor) {
  assertRole(actor, 'regional')
  const rows = await usersRepo.listOrgAdminsInRegion(actor.regionId)
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
  const current = await usersRepo.findOrgAdminInRegion(id, actor.regionId)
  if (!current) fail('Администратор не найден', 404)
  const org = await orgInRegion(input?.organizationId, actor.regionId)
  const displayName = cleanLabel(input?.displayName, 2, 80, 'Имя')
  await usersRepo.updateOrgAdmin(id, { displayName, organizationId: org.id })
  await setPassword(id, input?.password)
  return profile(id)
}

export async function deleteOrgAdmin(actor, id) {
  assertRole(actor, 'regional')
  const current = await usersRepo.findOrgAdminInRegion(id, actor.regionId)
  if (!current) fail('Администратор не найден', 404)
  await usersRepo.deleteUser(id)
}

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
    if (Array.isArray(value.richText)) return cleanText(value.richText.map((part) => part.text || '').join(''))
    if (value.result != null) return cellText(value.result)
    if (typeof value.text === 'string') return cleanText(value.text)
    return ''
  }
  return cleanText(value)
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
  const classes = (await classesRepo.listClassesWithTracks(actor.organizationId))
    .map((row) => ({ ...row, label: classCaption(row) }))
    .filter((item) => org.groups[item.band])
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

  const taken = await usersRepo.findTakenLogins(rows.map((row) => row.login.toLowerCase()))
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
    const batch = []
    chunk.forEach((row, index) => {
      const id = crypto.randomUUID()
      batch.push({ id, login: row.login, passwordHash: hashes[index], createdAt: now, displayName: row.displayName, organizationId: actor.organizationId, classId: row.klass.id })
      created.push({ id, displayName: row.displayName, login: row.login, password: row.password, classLabel: row.klass.label })
    })
    try {
      await usersRepo.insertLearners(batch)
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      // Кто-то занял логин между проверкой и вставкой: пачку повторяем по одному.
      created.splice(created.length - chunk.length, chunk.length)
      for (const [index, row] of chunk.entries()) {
        const id = crypto.randomUUID()
        try {
          await usersRepo.insertLearner({ id, login: row.login, passwordHash: hashes[index], createdAt: now, displayName: row.displayName, organizationId: actor.organizationId, classId: row.klass.id })
          created.push({ id, displayName: row.displayName, login: row.login, password: row.password, classLabel: row.klass.label })
        } catch (inner) {
          if (!isUniqueViolation(inner)) throw inner
          errors.push(`Логин «${row.login}» уже занят`)
        }
      }
    }
  }
  return { created: created.length, learners: created, errors }
}

async function classInOrg(classId, organizationId) {
  const row = await classesRepo.findClassWithTrack(classId, organizationId)
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
  const current = await usersRepo.findLearner(id, actor.organizationId)
  if (!current) fail('Тестируемый не найден', 404)
  const klass = await classInOrg(input?.classId, actor.organizationId)
  const displayName = cleanLabel(input?.displayName, 2, 80, 'Имя')
  await usersRepo.updateLearner(id, { displayName, classId: klass.id })
  await setPassword(id, input?.password)
  const user = await profile(id)
  return { ...user, classLabel: classCaption(klass) }
}

export async function deleteLearner(actor, id) {
  assertRole(actor, 'org')
  const changes = await usersRepo.deleteLearner(id, actor.organizationId)
  if (!changes) fail('Тестируемый не найден', 404)
}
