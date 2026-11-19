import { db } from '../infrastructure/db/index.js'
import { placeholders } from './sql.js'

const CHUNK_SIZE = 500

export async function listRegionStatsBase() {
  return db.all('SELECT id, name, name_kk FROM regions')
}

export async function countDistrictsByRegion() {
  const rows = await db.all('SELECT region_id AS id, COUNT(*) AS n FROM districts GROUP BY region_id')
  return new Map(rows.map((row) => [row.id, Number(row.n)]))
}

export async function countOrganizationsByRegion() {
  const rows = await db.all('SELECT region_id AS id, COUNT(*) AS n FROM organizations GROUP BY region_id')
  return new Map(rows.map((row) => [row.id, Number(row.n)]))
}

export async function listAllLearnerRegions() {
  return db.all(
    `SELECT u.id, o.region_id
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
      WHERE u.role = 'learner'`,
  )
}

export async function listLessonAttemptsByUsers(userIds) {
  if (!userIds.length) return []
  const rows = []
  for (let start = 0; start < userIds.length; start += CHUNK_SIZE) {
    const chunk = userIds.slice(start, start + CHUNK_SIZE)
    const found = await db.all(
      `SELECT lesson_id, user_id, lang, answers, finished_at
         FROM lesson_attempts
        WHERE user_id IN (${placeholders(chunk)})`,
      ...chunk,
    )
    rows.push(...found)
  }
  return rows
}

export async function listLessonsByIds(lessonIds) {
  if (!lessonIds.length) return []
  const rows = []
  for (let start = 0; start < lessonIds.length; start += CHUNK_SIZE) {
    const chunk = lessonIds.slice(start, start + CHUNK_SIZE)
    const found = await db.all(
      `SELECT id, questions, questions_kk
         FROM lessons
        WHERE id IN (${placeholders(chunk)})`,
      ...chunk,
    )
    rows.push(...found)
  }
  return rows
}

export async function listRegionDistricts(regionId) {
  return db.all(
    `SELECT d.id, d.name, d.name_kk, r.name AS region_name, r.name_kk AS region_name_kk,
            (SELECT COUNT(*) FROM organizations o WHERE o.district_id = d.id) AS organizations,
            (SELECT COUNT(*) FROM users u
               JOIN organizations o ON o.id = u.organization_id
              WHERE u.role = 'learner' AND o.district_id = d.id) AS learners
       FROM districts d
       JOIN regions r ON r.id = d.region_id
      WHERE d.region_id = ?
      ORDER BY r.name, d.sort_order, d.name`,
    regionId,
  )
}

export async function listRegionOrganizations(regionId) {
  return db.all(
    `SELECT o.id, o.district_id, o.name, o.name_kk, d.name AS district_name, d.name_kk AS district_name_kk,
            r.name AS region_name, r.name_kk AS region_name_kk,
            (SELECT COUNT(*) FROM classes c WHERE c.organization_id = o.id) AS classes,
            (SELECT COUNT(*) FROM users u WHERE u.role = 'learner' AND u.organization_id = o.id) AS learners
       FROM organizations o
       JOIN regions r ON r.id = o.region_id
       LEFT JOIN districts d ON d.id = o.district_id
      WHERE o.region_id = ?
      ORDER BY r.name, o.name`,
    regionId,
  )
}

export async function listAllLessons() {
  return db.all(
    `SELECT id, title, title_kk, format, grades_1_4, grades_5_9, grades_10_11, students, questions, questions_kk
       FROM lessons
      ORDER BY created_at DESC`,
  )
}

export async function listRegionLearners(regionId) {
  return db.all(
    `SELECT u.id, u.display_name, o.id AS organization_id, o.district_id, c.band
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
       LEFT JOIN classes c ON c.id = u.class_id
      WHERE u.role = 'learner' AND o.region_id = ?`,
    regionId,
  )
}

export async function listRegionLessonAttempts(regionId) {
  return db.all(
    `SELECT a.lesson_id, a.user_id, a.lang, a.answers
       FROM lesson_attempts a
       JOIN users u ON u.id = a.user_id
       JOIN organizations o ON o.id = u.organization_id
      WHERE u.role = 'learner' AND o.region_id = ?`,
    regionId,
  )
}

export async function listPlatformQuizzes() {
  return db.all(
    `SELECT q.id, q.title, q.questions
       FROM quizzes q
       JOIN users u ON u.id = q.user_id
      WHERE u.role = 'super'
      ORDER BY q.updated_at DESC`,
  )
}

export async function listRegionQuizResults(regionId) {
  return db.all(
    `SELECT r.quiz_id, r.quiz_title, r.players, r.access, r.organization_id, r.band
       FROM results r
       LEFT JOIN organizations o ON o.id = r.organization_id
       LEFT JOIN users u ON u.id = r.user_id
      WHERE o.region_id = ?
         OR (r.organization_id IS NULL AND COALESCE(r.access, 'public') <> 'private' AND u.role = 'super')`,
    regionId,
  )
}

export async function listOrgLearners(orgId) {
  return db.all(
    `SELECT id, display_name, login, class_id
       FROM users
      WHERE role = 'learner' AND organization_id = ?`,
    orgId,
  )
}

export async function listOrgLessonAttempts(orgId) {
  return db.all(
    `SELECT a.lesson_id, a.user_id, a.lang, a.answers, a.finished_at
       FROM lesson_attempts a
       JOIN users u ON u.id = a.user_id
      WHERE u.role = 'learner' AND u.organization_id = ?`,
    orgId,
  )
}

export async function listOrgPrivateResults(orgId) {
  return db.all(
    `SELECT quiz_id, quiz_title, players, started_at, finished_at
       FROM results
      WHERE access = 'private' AND organization_id = ?`,
    orgId,
  )
}

export async function listQuizzesByIds(quizIds) {
  if (!quizIds.length) return []
  const rows = []
  for (let start = 0; start < quizIds.length; start += CHUNK_SIZE) {
    const chunk = quizIds.slice(start, start + CHUNK_SIZE)
    const found = await db.all(
      `SELECT id, title, questions
         FROM quizzes
        WHERE id IN (${placeholders(chunk)})`,
      ...chunk,
    )
    rows.push(...found)
  }
  return rows
}
