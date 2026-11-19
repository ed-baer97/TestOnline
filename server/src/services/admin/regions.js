import crypto from 'node:crypto'
import { assertRole } from '../../domain/access.js'
import { readPassword } from '../../domain/accounts.js'
import { fail } from '../../domain/errors.js'
import { cleanLabel, optionalLabel, sameText } from '../../domain/text.js'
import * as organizationsRepo from '../../repositories/organizations.js'
import * as regionsRepo from '../../repositories/regions.js'
import * as usersRepo from '../../repositories/users.js'
import { changePassword, createAccount, profile } from '../accounts.js'
import { mustRegion } from './scope.js'

export async function listRegions(actor) {
  assertRole(actor, 'super')
  const [regions, orgCounts, adminCounts, learnerCounts] = await Promise.all([
    regionsRepo.listRegions(),
    organizationsRepo.organizationCountsByRegion(),
    usersRepo.regionalAdminCountsByRegion(),
    usersRepo.learnerCountsByRegion(),
  ])
  return regions
    .map((region) => ({
      id: region.id,
      name: region.name,
      nameKk: region.nameKk,
      createdAt: region.createdAt,
      organizations: orgCounts.get(region.id) || 0,
      admins: adminCounts.get(region.id) || 0,
      learners: learnerCounts.get(region.id) || 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

async function assertUniqueRegion(name, nameKk, exceptId = '') {
  const rows = await regionsRepo.listRegionNames()
  if (rows.some((row) => row.id !== exceptId && (sameText(row.name, name) || (nameKk && row.name_kk && sameText(row.name_kk, nameKk))))) {
    fail('Такой регион уже есть', 409)
  }
}

export async function createRegion(actor, input) {
  assertRole(actor, 'super')
  const name = cleanLabel(input?.name, 2, 80, 'Название региона')
  const nameKk = optionalLabel(input?.nameKk, 80, 'Название региона')
  await assertUniqueRegion(name, nameKk)
  const id = crypto.randomUUID()
  await regionsRepo.insertRegion({ id, name, nameKk, createdAt: new Date().toISOString() })
  return mustRegion(id)
}

export async function updateRegion(actor, id, input) {
  assertRole(actor, 'super')
  const current = await mustRegion(id)
  const name = cleanLabel(input?.name, 2, 80, 'Название региона')
  const nameKk = input?.nameKk == null ? current.nameKk : optionalLabel(input.nameKk, 80, 'Название региона')
  await assertUniqueRegion(name, nameKk, id)
  await regionsRepo.updateRegion(id, { name, nameKk })
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
  return createAccount({
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
  const password = readPassword(input?.password)
  await usersRepo.updateRegionalAdmin(id, { displayName, regionId: region.id })
  await changePassword(id, password)
  return profile(id)
}

export async function deleteRegionalAdmin(actor, id) {
  assertRole(actor, 'super')
  const changes = await usersRepo.deleteRegionalAdmin(id)
  if (!changes) fail('Администратор не найден', 404)
}
