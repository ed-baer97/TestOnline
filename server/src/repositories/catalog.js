import { db } from '../infrastructure/db/index.js'

export async function findSeed(key) {
  return db.get('SELECT key FROM app_seeds WHERE key = ?', key)
}

export async function insertSeed(key, appliedAt) {
  await db.run('INSERT INTO app_seeds (key, applied_at) VALUES (?, ?)', key, appliedAt)
}

export async function setRegionNameKk(id, nameKk) {
  await db.run('UPDATE regions SET name_kk = ? WHERE id = ?', nameKk, id)
}

export async function findDistrictByName(regionId, name) {
  return db.get(
    'SELECT id, name_kk FROM districts WHERE region_id = ? AND lower(name) = lower(?)',
    regionId,
    name,
  )
}

export async function setDistrictNameKk(id, nameKk) {
  await db.run('UPDATE districts SET name_kk = ? WHERE id = ?', nameKk, id)
}

export async function findOrganizationByName(regionId, name) {
  return db.get(
    'SELECT id FROM organizations WHERE region_id = ? AND lower(name) = lower(?)',
    regionId,
    name,
  )
}
