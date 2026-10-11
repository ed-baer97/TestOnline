import { fail } from '../../domain/errors.js'
import * as classesRepo from '../../repositories/classes.js'
import * as organizationsRepo from '../../repositories/organizations.js'
import * as regionsRepo from '../../repositories/regions.js'

export async function mustRegion(id) {
  const region = await regionsRepo.findRegion(id)
  if (!region) fail('Регион не найден', 404)
  return region
}

export async function mustOrg(id) {
  const org = await organizationsRepo.findOrganization(id)
  if (!org) fail('Организация не найдена', 404)
  return org
}

export async function orgInRegion(id, regionId) {
  const org = await mustOrg(id)
  if (org.regionId !== regionId) fail('Организация не найдена', 404)
  return org
}

export async function classInOrg(classId, organizationId) {
  const row = await classesRepo.findClassWithTrack(classId, organizationId)
  if (!row) fail('Класс не найден', 404)
  const org = await mustOrg(organizationId)
  if (!org.groups[row.band]) fail('Эта группа в организации не отмечена')
  return row
}
