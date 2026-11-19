import { groupNumbers } from '../domain/structure.js'
import { db } from '../infrastructure/db/index.js'

function txCatalog(tx) {
  return {
    async claimSeed(key, appliedAt) {
      const result = await tx.run(
        'INSERT INTO app_seeds (key, applied_at) VALUES (?, ?) ON CONFLICT (key) DO NOTHING',
        key,
        appliedAt,
      )
      return result.changes > 0
    },
    async setRegionNameKk(id, nameKk) {
      await tx.run('UPDATE regions SET name_kk = ? WHERE id = ?', nameKk, id)
    },
    async findDistrictByName(regionId, name) {
      return tx.get(
        'SELECT id, name_kk FROM districts WHERE region_id = ? AND lower(name) = lower(?)',
        regionId,
        name,
      )
    },
    async insertDistrict({ id, regionId, name, nameKk, sortOrder, createdAt }) {
      await tx.run(
        'INSERT INTO districts (id, region_id, name, name_kk, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        id,
        regionId,
        name,
        nameKk,
        sortOrder,
        createdAt,
      )
    },
    async setDistrictNameKk(id, nameKk) {
      await tx.run('UPDATE districts SET name_kk = ? WHERE id = ?', nameKk, id)
    },
    async findOrganizationByName(regionId, name) {
      return tx.get(
        'SELECT id FROM organizations WHERE region_id = ? AND lower(name) = lower(?)',
        regionId,
        name,
      )
    },
    async insertOrganization({ id, regionId, name, nameKk = '', districtId = null, groups, createdAt }) {
      await tx.run(
        `INSERT INTO organizations (id, region_id, district_id, name, name_kk, grades_1_4, grades_5_9, grades_10_11, students, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        regionId,
        districtId,
        name,
        nameKk,
        ...groupNumbers(groups),
        createdAt,
      )
    },
  }
}

export async function runCatalogSeed(fn) {
  return db.tx((tx) => fn(txCatalog(tx)))
}
