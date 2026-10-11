import { db } from '../infrastructure/db/index.js'
import { count } from './sql.js'

export async function listTracks(organizationId) {
  return db.all('SELECT id, name FROM tracks WHERE organization_id = ?', organizationId)
}

export async function countTracks(organizationId) {
  return count('SELECT COUNT(*) AS n FROM tracks WHERE organization_id = ?', organizationId)
}

export async function findTrack(id, organizationId) {
  return db.get('SELECT id FROM tracks WHERE id = ? AND organization_id = ?', id, organizationId)
}

export async function insertTrack({ id, organizationId, name, createdAt }) {
  await db.run(
    'INSERT INTO tracks (id, organization_id, name, created_at) VALUES (?, ?, ?, ?)',
    id,
    organizationId,
    name,
    createdAt,
  )
}

export async function renameTrack(id, name) {
  await db.run('UPDATE tracks SET name = ? WHERE id = ?', name, id)
}

export async function deleteTrack(id) {
  await db.run('DELETE FROM tracks WHERE id = ?', id)
}
