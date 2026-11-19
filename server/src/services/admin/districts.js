import crypto from 'node:crypto'
import { assertRole } from '../../domain/access.js'
import { fail } from '../../domain/errors.js'
import { cleanLabel, optionalLabel, sameText } from '../../domain/text.js'
import * as districtsRepo from '../../repositories/districts.js'
import { mustRegion } from './scope.js'

function regionIdFor(actor, regionId) {
  assertRole(actor, 'super', 'regional')
  if (actor.role === 'regional') return actor.regionId
  if (!regionId) fail('Регион не найден', 404)
  return regionId
}

export async function districtForOrganization(regionId, districtId) {
  const districts = await districtsRepo.countDistricts(regionId)
  if (!districts) return null
  const row = await districtsRepo.findDistrictInRegion(districtId, regionId)
  if (!row) fail('Выберите район')
  return row.id
}

export async function listDistricts(actor, regionId = null) {
  const id = regionIdFor(actor, regionId)
  if (actor.role === 'super') await mustRegion(id)
  const rows = await districtsRepo.listDistrictRows(id)
  return rows.map((row) => ({ id: row.id, name: row.name, nameKk: row.name_kk || '' }))
}

export async function createDistrict(actor, input) {
  const regionId = regionIdFor(actor, input?.regionId)
  await mustRegion(regionId)
  const name = cleanLabel(input?.name, 2, 80, 'Название района')
  const nameKk = optionalLabel(input?.nameKk, 80, 'Название района')
  const rows = await districtsRepo.listDistrictNames(regionId)
  if (rows.some((row) => sameText(row.name, name) || (nameKk && row.name_kk && sameText(row.name_kk, nameKk)))) {
    fail('Такой район уже есть', 409)
  }
  const id = crypto.randomUUID()
  await districtsRepo.insertDistrict({
    id,
    regionId,
    name,
    nameKk,
    sortOrder: await districtsRepo.nextDistrictOrder(regionId),
    createdAt: new Date().toISOString(),
  })
  return { id, name, nameKk }
}

export async function deleteDistrict(actor, id) {
  assertRole(actor, 'super', 'regional')
  const row = await districtsRepo.findDistrict(id)
  if (!row) fail('Район не найден', 404)
  if (actor.role === 'regional' && row.region_id !== actor.regionId) fail('Район не найден', 404)
  const schools = await districtsRepo.countSchoolsInDistrict(id)
  if (schools) fail('Сначала удалите школы этого района')
  await districtsRepo.deleteDistrict(id)
}
