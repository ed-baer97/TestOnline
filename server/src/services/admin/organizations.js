import crypto from 'node:crypto'
import { assertRole } from '../../domain/access.js'
import { fail } from '../../domain/errors.js'
import { readGroups } from '../../domain/structure.js'
import { cleanLabel, sameText } from '../../domain/text.js'
import * as classesRepo from '../../repositories/classes.js'
import * as organizationsRepo from '../../repositories/organizations.js'
import * as tracksRepo from '../../repositories/tracks.js'
import * as usersRepo from '../../repositories/users.js'
import { changePassword, createAccount, profile } from '../accounts.js'
import { mustOrg, orgInRegion } from './scope.js'

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
  return createAccount({
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
  await changePassword(id, input?.password)
  return profile(id)
}

export async function deleteOrgAdmin(actor, id) {
  assertRole(actor, 'regional')
  const current = await usersRepo.findOrgAdminInRegion(id, actor.regionId)
  if (!current) fail('Администратор не найден', 404)
  await usersRepo.deleteUser(id)
}
