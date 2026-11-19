import { db } from '../infrastructure/db/index.js'

function mapRegion(row) {
  return { id: row.id, name: row.name, nameKk: row.name_kk || '', createdAt: row.created_at }
}

export async function findRegion(id) {
  const row = await db.get('SELECT id, name, name_kk, created_at FROM regions WHERE id = ?', id)
  return row ? mapRegion(row) : null
}

export async function listRegions() {
  const rows = await db.all('SELECT id, name, name_kk, created_at FROM regions')
  return rows.map(mapRegion)
}

export async function listRegionNames() {
  return db.all('SELECT id, name, name_kk FROM regions')
}

export async function insertRegion({ id, name, nameKk = '', createdAt }) {
  await db.run('INSERT INTO regions (id, name, name_kk, created_at) VALUES (?, ?, ?, ?)', id, name, nameKk, createdAt)
}

export async function updateRegion(id, { name, nameKk = '' }) {
  await db.run('UPDATE regions SET name = ?, name_kk = ? WHERE id = ?', name, nameKk, id)
}

export async function deleteRegion(id) {
  await db.tx(async (tx) => {
    await tx.run('DELETE FROM districts WHERE region_id = ?', id)
    await tx.run('DELETE FROM app_seeds WHERE key = ?', `mangystau-catalog-v1:${id}`)
    await tx.run('DELETE FROM regions WHERE id = ?', id)
  })
}
