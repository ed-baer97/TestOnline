import { groupNumbers, groupsFromRow } from '../domain/structure.js'
import { db } from '../infrastructure/db/index.js'
import { count } from './sql.js'

const ORG_SELECT = `SELECT o.*, d.name AS district_name, d.name_kk AS district_name_kk
  FROM organizations o
  LEFT JOIN districts d ON d.id = o.district_id`

function mapOrg(row) {
  return {
    id: row.id,
    regionId: row.region_id,
    districtId: row.district_id || null,
    districtName: row.district_name || '',
    districtNameKk: row.district_name_kk || '',
    name: row.name,
    nameKk: row.name_kk || '',
    groups: groupsFromRow(row),
    createdAt: row.created_at,
  }
}

export async function findOrganization(id) {
  const row = await db.get(`${ORG_SELECT} WHERE o.id = ?`, id)
  return row ? mapOrg(row) : null
}

export async function listOrganizations(regionId) {
  const rows = await db.all(`${ORG_SELECT} WHERE o.region_id = ?`, regionId)
  return rows.map(mapOrg)
}

export async function listAllOrganizations() {
  const rows = await db.all(ORG_SELECT)
  return rows.map(mapOrg)
}

export async function listOrganizationNames(regionId) {
  return db.all('SELECT id, name, name_kk FROM organizations WHERE region_id = ?', regionId)
}

export async function listAllOrganizationNames() {
  return db.all('SELECT id, name, name_kk FROM organizations ORDER BY name')
}

export async function listRegionOrganizationNames(regionId) {
  return db.all('SELECT id, name, name_kk FROM organizations WHERE region_id = ? ORDER BY name', regionId)
}

export async function findOrganizationName(id) {
  return db.get('SELECT id, name, name_kk FROM organizations WHERE id = ?', id)
}

export async function countOrganizations() {
  return count('SELECT COUNT(*) AS n FROM organizations')
}

export async function countOrganizationsInRegion(regionId) {
  return count('SELECT COUNT(*) AS n FROM organizations WHERE region_id = ?', regionId)
}

export async function organizationCountsByRegion() {
  const rows = await db.all('SELECT region_id AS id, COUNT(*) AS n FROM organizations GROUP BY region_id')
  return new Map(rows.map((row) => [row.id, Number(row.n)]))
}

export async function insertOrganization({ id, regionId, name, nameKk = '', districtId = null, groups, createdAt }) {
  await db.run(
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
}

export async function updateOrganization(id, { name, nameKk = '', districtId = null, groups }) {
  await db.run(
    `UPDATE organizations SET name = ?, name_kk = ?, district_id = ?, grades_1_4 = ?, grades_5_9 = ?, grades_10_11 = ?, students = ? WHERE id = ?`,
    name,
    nameKk,
    districtId,
    ...groupNumbers(groups),
    id,
  )
}

export async function deleteOrganization(id) {
  await db.run('DELETE FROM organizations WHERE id = ?', id)
}
