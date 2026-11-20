import { fail } from '../../domain/errors.js'
import { BANDS, classCaption, GROUP_KEYS } from '../../domain/structure.js'
import * as classesRepo from '../../repositories/classes.js'
import * as districtsRepo from '../../repositories/districts.js'
import * as organizationsRepo from '../../repositories/organizations.js'
import * as usersRepo from '../../repositories/users.js'
import { listRegions } from './regions.js'
import { mustOrg, mustRegion } from './scope.js'

function byValue(items) {
  return [...items].sort((a, b) => b.value - a.value || String(a.label).localeCompare(String(b.label), 'ru'))
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

function districtBuckets(districts, orgRows) {
  const buckets = new Map(districts.map((district) => [district.id, {
    key: district.id,
    name: district.name,
    nameKk: district.name_kk || '',
    rows: [],
  }]))
  const loose = { key: 'none', name: 'Без района', nameKk: 'Аудансыз', rows: [] }
  for (const org of orgRows) {
    const bucket = (org.districtId && buckets.get(org.districtId)) || loose
    bucket.rows.push(org)
  }
  const groups = [...buckets.values()].filter((group) => group.rows.length)
  if (loose.rows.length) groups.push(loose)
  if (groups.length < 2) return null
  return groups.map((group) => ({
    key: group.key,
    name: group.name,
    nameKk: group.nameKk,
    organizations: group.rows.length,
    classes: group.rows.reduce((sum, org) => sum + org.classes, 0),
    learners: group.rows.reduce((sum, org) => sum + org.learners, 0),
    admins: group.rows.reduce((sum, org) => sum + org.admins, 0),
    rows: group.rows,
  }))
}

function orgCells(org) {
  return [org.name, org.classes, org.learners, org.admins]
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
  const adminByOrg = await usersRepo.orgAdminCountsByOrganization(ids)
  const orgRows = orgs
    .map((org) => ({
      id: org.id,
      name: org.name,
      districtId: org.districtId,
      classes: rows.filter((item) => item.organizationId === org.id).length,
      learners: learnersByOrg.get(org.id) || 0,
      admins: adminByOrg.get(org.id) || 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  const groups = districtBuckets(await districtsRepo.listDistrictRows(regionId), orgRows)
  const orgChart = chart('Тестируемые по организациям', orgRows.map((org) => ({ key: org.id, label: org.name, value: org.learners })))
  if (groups) {
    orgChart.groups = groups.map((group) => ({
      key: group.key,
      name: group.name,
      nameKk: group.nameKk,
      organizations: group.organizations,
      classes: group.classes,
      learners: group.learners,
      admins: group.admins,
      items: byValue(group.rows.map((org) => ({ key: org.id, label: org.name, value: org.learners }))),
    }))
  }
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
      orgChart,
      chart('Тестируемые по группам', bandItems(rows, orgs), 'given'),
      chart('Тестируемые по параллелям', gradeItems(rows), 'given'),
    ],
    table: {
      caption: 'Организации',
      columns: ['Организация', 'Классы', 'Тестируемые', 'Админы'],
      rows: orgRows.map((org) => ({ key: org.id, cells: orgCells(org) })),
      ...(groups ? {
        groups: groups.map((group) => ({
          key: group.key,
          name: group.name,
          nameKk: group.nameKk,
          organizations: group.organizations,
          classes: group.classes,
          learners: group.learners,
          admins: group.admins,
          rows: group.rows.map((org) => ({ key: org.id, cells: orgCells(org) })),
        })),
      } : {}),
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
