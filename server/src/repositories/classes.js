import { db } from '../infrastructure/db/index.js'
import { count, countsById, placeholders } from './sql.js'

// Классы организаций с курсом и числом тестируемых — для сводок региона и организации.
export async function listClassesWithLearners(organizationIds) {
  if (!organizationIds.length) return []
  const rows = await db.all(
    `SELECT c.id, c.name, c.band, c.grade, c.organization_id, t.name AS track_name,
            (SELECT COUNT(*) FROM users u WHERE u.role = 'learner' AND u.class_id = c.id) AS learners
     FROM classes c
     LEFT JOIN tracks t ON t.id = c.track_id
     WHERE c.organization_id IN (${placeholders(organizationIds)})`,
    ...organizationIds,
  )
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    band: row.band,
    grade: row.grade == null ? null : Number(row.grade),
    organizationId: row.organization_id,
    trackName: row.track_name,
    learners: Number(row.learners),
  }))
}

// Классы одной организации для дерева «параллели / курсы».
export async function listOrganizationClasses(organizationId) {
  const rows = await db.all(
    `SELECT c.id, c.name, c.band, c.grade, c.track_id,
            (SELECT COUNT(*) FROM users u WHERE u.role = 'learner' AND u.class_id = c.id) AS learners
     FROM classes c WHERE c.organization_id = ?`,
    organizationId,
  )
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    band: row.band,
    grade: row.grade == null ? null : Number(row.grade),
    trackId: row.track_id,
    learners: Number(row.learners),
  }))
}

export async function listClassesWithTracks(organizationId) {
  return db.all(
    `SELECT c.id, c.band, c.name AS class_name, c.grade, t.name AS track_name
     FROM classes c LEFT JOIN tracks t ON t.id = c.track_id
     WHERE c.organization_id = ?`,
    organizationId,
  )
}

export async function findClassWithTrack(id, organizationId) {
  return db.get(
    `SELECT c.id, c.band, c.name AS class_name, c.grade, t.name AS track_name
     FROM classes c LEFT JOIN tracks t ON t.id = c.track_id
     WHERE c.id = ? AND c.organization_id = ?`,
    id,
    organizationId,
  )
}

export async function findClass(id, organizationId) {
  return db.get('SELECT * FROM classes WHERE id = ? AND organization_id = ?', id, organizationId)
}

export async function findClassId(id, organizationId) {
  return db.get('SELECT id FROM classes WHERE id = ? AND organization_id = ?', id, organizationId)
}

export async function findClassBand(id) {
  return db.get('SELECT band FROM classes WHERE id = ?', id)
}

export async function countClasses(organizationId) {
  return count('SELECT COUNT(*) AS n FROM classes WHERE organization_id = ?', organizationId)
}

export async function countClassesIn(organizationIds) {
  if (!organizationIds.length) return 0
  return count(`SELECT COUNT(*) AS n FROM classes WHERE organization_id IN (${placeholders(organizationIds)})`, ...organizationIds)
}

export async function classCountsByOrganization(organizationIds) {
  return countsById(
    `SELECT organization_id AS id, COUNT(*) AS n FROM classes WHERE organization_id IN (${placeholders(organizationIds)}) GROUP BY organization_id`,
    organizationIds,
  )
}

export async function countTrackClasses(trackId) {
  return count('SELECT COUNT(*) AS n FROM classes WHERE track_id = ?', trackId)
}

export async function listBands(organizationId) {
  return db.all('SELECT DISTINCT band FROM classes WHERE organization_id = ?', organizationId)
}

export async function listTrackClassNames(organizationId, trackId) {
  return db.all('SELECT id, name FROM classes WHERE organization_id = ? AND track_id = ?', organizationId, trackId)
}

export async function listGradeClassNames(organizationId, band, grade) {
  return db.all('SELECT id, name FROM classes WHERE organization_id = ? AND band = ? AND grade = ?', organizationId, band, grade)
}

export async function insertTrackClass({ id, organizationId, trackId, name, createdAt }) {
  await db.run(
    `INSERT INTO classes (id, organization_id, band, grade, track_id, name, created_at)
     VALUES (?, ?, 'students', NULL, ?, ?, ?)`,
    id,
    organizationId,
    trackId,
    name,
    createdAt,
  )
}

export async function insertGradeClass({ id, organizationId, band, grade, name, createdAt }) {
  await db.run(
    `INSERT INTO classes (id, organization_id, band, grade, track_id, name, created_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    id,
    organizationId,
    band,
    grade,
    name,
    createdAt,
  )
}

export async function renameClass(id, name) {
  await db.run('UPDATE classes SET name = ? WHERE id = ?', name, id)
}

export async function deleteClass(id) {
  await db.run('DELETE FROM classes WHERE id = ?', id)
}
