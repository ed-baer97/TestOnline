import { db } from '../infrastructure/db/index.js'
import { count } from './sql.js'

export async function countDistricts(regionId) {
  return count('SELECT COUNT(*) AS n FROM districts WHERE region_id = ?', regionId)
}

export async function findDistrictInRegion(id, regionId) {
  return db.get('SELECT id FROM districts WHERE id = ? AND region_id = ?', id, regionId)
}

export async function listDistrictRows(regionId) {
  return db.all(
    'SELECT id, name, name_kk FROM districts WHERE region_id = ? ORDER BY sort_order, name',
    regionId,
  )
}

export async function listAllDistricts() {
  return db.all('SELECT id, region_id, name, name_kk FROM districts ORDER BY sort_order, name')
}

export async function listDistrictNames(regionId) {
  return db.all('SELECT id, name, name_kk FROM districts WHERE region_id = ?', regionId)
}

export async function nextDistrictOrder(regionId) {
  const row = await db.get('SELECT COALESCE(MAX(sort_order), 0) AS n FROM districts WHERE region_id = ?', regionId)
  return Number(row?.n || 0) + 1
}

export async function insertDistrict({ id, regionId, name, nameKk, sortOrder, createdAt }) {
  await db.run(
    'INSERT INTO districts (id, region_id, name, name_kk, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    regionId,
    name,
    nameKk,
    sortOrder,
    createdAt,
  )
}

export async function findDistrict(id) {
  return db.get('SELECT id, region_id FROM districts WHERE id = ?', id)
}

export async function countSchoolsInDistrict(id) {
  return count('SELECT COUNT(*) AS n FROM organizations WHERE district_id = ?', id)
}

export async function deleteDistrict(id) {
  await db.run('DELETE FROM districts WHERE id = ?', id)
}
