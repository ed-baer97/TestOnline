import { db } from '../infrastructure/db/index.js'

function mapRegion(row) {
  return { id: row.id, name: row.name, createdAt: row.created_at }
}

export async function findRegion(id) {
  const row = await db.get('SELECT id, name, created_at FROM regions WHERE id = ?', id)
  return row ? mapRegion(row) : null
}

export async function listRegions() {
  const rows = await db.all('SELECT id, name, created_at FROM regions')
  return rows.map(mapRegion)
}

export async function listRegionNames() {
  return db.all('SELECT id, name FROM regions')
}

export async function insertRegion({ id, name, createdAt }) {
  await db.run('INSERT INTO regions (id, name, created_at) VALUES (?, ?, ?)', id, name, createdAt)
}

export async function renameRegion(id, name) {
  await db.run('UPDATE regions SET name = ? WHERE id = ?', name, id)
}

export async function deleteRegion(id) {
  await db.run('DELETE FROM regions WHERE id = ?', id)
}
