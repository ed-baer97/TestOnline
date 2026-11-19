import crypto from 'node:crypto'
import { assertRole } from '../../domain/access.js'
import { fail } from '../../domain/errors.js'
import { GROUP_FLAGS, MANGYSTAU_DISTRICTS, MANGYSTAU_REGION, isMangystau } from '../../domain/mangystau.js'
import * as catalogRepo from '../../repositories/catalog.js'
import * as districtsRepo from '../../repositories/districts.js'
import * as organizationsRepo from '../../repositories/organizations.js'
import { mustRegion } from './scope.js'

function seedKey(regionId) {
  return `mangystau-catalog-v1:${regionId}`
}

export async function seedRegionCatalog(actor, regionId) {
  assertRole(actor, 'super', 'regional')
  const id = actor.role === 'regional' ? actor.regionId : regionId
  if (!id) fail('Регион не найден', 404)
  const region = await mustRegion(id)
  if (!isMangystau(region.name, region.nameKk)) fail('Каталог школ есть для Мангистауской области')
  const key = seedKey(region.id)
  if (await catalogRepo.findSeed(key)) return { ok: true, already: true, districts: 0, schools: 0 }
  if (!region.nameKk) await catalogRepo.setRegionNameKk(region.id, MANGYSTAU_REGION.nameKk)
  const now = new Date().toISOString()
  const districtIds = new Map()
  for (const district of MANGYSTAU_DISTRICTS) {
    let row = await catalogRepo.findDistrictByName(region.id, district.name)
    if (!row) {
      const districtId = crypto.randomUUID()
      await districtsRepo.insertDistrict({
        id: districtId,
        regionId: region.id,
        name: district.name,
        nameKk: district.nameKk,
        sortOrder: district.order,
        createdAt: now,
      })
      row = { id: districtId, name_kk: district.nameKk }
    } else if (!row.name_kk) {
      await catalogRepo.setDistrictNameKk(row.id, district.nameKk)
    }
    districtIds.set(district.name, row.id)
  }
  let schools = 0
  for (const district of MANGYSTAU_DISTRICTS) {
    const districtId = districtIds.get(district.name)
    for (const school of district.schools) {
      const existing = await catalogRepo.findOrganizationByName(region.id, school.name)
      if (existing) continue
      const [grades14, grades59, grades1011, students] = GROUP_FLAGS[school.kind] || GROUP_FLAGS.school
      await organizationsRepo.insertOrganization({
        id: crypto.randomUUID(),
        regionId: region.id,
        districtId,
        name: school.name,
        nameKk: school.nameKk,
        groups: {
          grades_1_4: Boolean(grades14),
          grades_5_9: Boolean(grades59),
          grades_10_11: Boolean(grades1011),
          students: Boolean(students),
        },
        createdAt: now,
      })
      schools += 1
    }
  }
  await catalogRepo.insertSeed(key, now)
  return { ok: true, already: false, districts: MANGYSTAU_DISTRICTS.length, schools }
}
