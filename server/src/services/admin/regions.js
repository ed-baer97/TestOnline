import crypto from 'node:crypto'
import { assertRole } from '../../domain/access.js'
import { fail } from '../../domain/errors.js'
import { cleanLabel, sameText } from '../../domain/text.js'
import * as organizationsRepo from '../../repositories/organizations.js'
import * as regionsRepo from '../../repositories/regions.js'
import * as usersRepo from '../../repositories/users.js'
import { changePassword, createAccount, profile } from '../accounts.js'
import { mustRegion } from './scope.js'

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
  await usersRepo.updateRegionalAdmin(id, { displayName, regionId: region.id })
  await changePassword(id, input?.password)
  return profile(id)
}

export async function deleteRegionalAdmin(actor, id) {
  assertRole(actor, 'super')
  const changes = await usersRepo.deleteRegionalAdmin(id)
  if (!changes) fail('Администратор не найден', 404)
}
