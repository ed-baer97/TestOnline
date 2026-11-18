import { groupNumbers } from '../domain/structure.js'
import { db } from '../infrastructure/db/index.js'

const FIELDS = 'id, name, sort_order, grades_1_4, grades_5_9, grades_10_11, students, created_at'

export async function listSections() {
  return db.all(`SELECT ${FIELDS} FROM lesson_sections ORDER BY sort_order, name`)
}

export async function findSection(id) {
  return db.get(`SELECT ${FIELDS} FROM lesson_sections WHERE id = ?`, id)
}

export async function nextSort() {
  const row = await db.get('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM lesson_sections')
  return Number(row?.n || 0)
}

export async function insertSection({ id, name, sortOrder, groups, createdAt }) {
  await db.run(
    `INSERT INTO lesson_sections (
      id, name, sort_order, grades_1_4, grades_5_9, grades_10_11, students, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    name,
    sortOrder,
    ...groupNumbers(groups),
    createdAt,
  )
}

export async function updateSection(id, { name, groups }) {
  await db.run(
    `UPDATE lesson_sections
     SET name = ?, grades_1_4 = ?, grades_5_9 = ?, grades_10_11 = ?, students = ?
     WHERE id = ?`,
    name,
    ...groupNumbers(groups),
    id,
  )
}

export async function deleteSection(id) {
  await db.run('DELETE FROM lesson_section_lessons WHERE section_id = ?', id)
  await db.run('DELETE FROM lesson_sections WHERE id = ?', id)
}

export async function lessonIdsInSection(sectionId) {
  const rows = await db.all(
    'SELECT lesson_id FROM lesson_section_lessons WHERE section_id = ? ORDER BY sort_order',
    sectionId,
  )
  return rows.map((row) => row.lesson_id)
}

export async function listPlacements() {
  return db.all(
    `SELECT link.lesson_id, link.section_id, section.name, section.sort_order
     FROM lesson_section_lessons link
     JOIN lesson_sections section ON section.id = link.section_id`,
  )
}

export async function findPlacement(lessonId) {
  return db.get(
    `SELECT link.lesson_id, link.section_id, section.name, section.sort_order
     FROM lesson_section_lessons link
     JOIN lesson_sections section ON section.id = link.section_id
     WHERE link.lesson_id = ?`,
    lessonId,
  )
}

export async function replacePlacement(lessonId, sectionId) {
  await db.run('DELETE FROM lesson_section_lessons WHERE lesson_id = ?', lessonId)
  const row = await db.get(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM lesson_section_lessons WHERE section_id = ?',
    sectionId,
  )
  await db.run(
    'INSERT INTO lesson_section_lessons (section_id, lesson_id, sort_order) VALUES (?, ?, ?)',
    sectionId,
    lessonId,
    Number(row?.n || 0),
  )
}

export async function deleteLessonPlacement(lessonId) {
  await db.run('DELETE FROM lesson_section_lessons WHERE lesson_id = ?', lessonId)
}
