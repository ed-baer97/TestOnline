import { groupNumbers, groupsFromRow } from '../domain/structure.js'
import { db } from '../infrastructure/db/index.js'
import { count } from './sql.js'

function mapOrg(row) {
  return {
    id: row.id,
    regionId: row.region_id,
    name: row.name,
    groups: groupsFromRow(row),
    createdAt: row.created_at,
  }
}

export async function findOrganization(id) {
  const row = await db.get('SELECT * FROM organizations WHERE id = ?', id)
  return row ? mapOrg(row) : null
}

export async function listOrganizations(regionId) {
  const rows = await db.all('SELECT * FROM organizations WHERE region_id = ?', regionId)
  return rows.map(mapOrg)
}

export async function listOrganizationNames(regionId) {
  return db.all('SELECT id, name FROM organizations WHERE region_id = ?', regionId)
}

export async function countOrganizations() {
  return count('SELECT COUNT(*) AS n FROM organizations')
}

export async function countOrganizationsInRegion(regionId) {
  return count('SELECT COUNT(*) AS n FROM organizations WHERE region_id = ?', regionId)
}

export async function insertOrganization({ id, regionId, name, groups, createdAt }) {
  await db.run(
    `INSERT INTO organizations (id, region_id, name, grades_1_4, grades_5_9, grades_10_11, students, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    regionId,
    name,
    ...groupNumbers(groups),
    createdAt,
  )
}

export async function updateOrganization(id, { name, groups }) {
  await db.run(
    `UPDATE organizations SET name = ?, grades_1_4 = ?, grades_5_9 = ?, grades_10_11 = ?, students = ? WHERE id = ?`,
    name,
    ...groupNumbers(groups),
    id,
  )
}

export async function deleteOrganization(id) {
  await db.run('DELETE FROM organizations WHERE id = ?', id)
}
