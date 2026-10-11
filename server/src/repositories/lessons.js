import { GROUP_KEYS, groupNumbers } from '../domain/structure.js'
import { db } from '../infrastructure/db/index.js'
import { count } from './sql.js'

// Уроки отдаются строками таблицы: сервис сам разбирает slides / questions и колонки групп.

export async function findSeededLesson(seedKey) {
  return db.get('SELECT id FROM lessons WHERE seed_key = ?', seedKey)
}

export async function countLessons() {
  return count('SELECT COUNT(*) AS n FROM lessons')
}

// Демо-урок всегда для 5–9 классов.
export async function insertSeedLesson({ id, title, seedKey, slides, questions, createdAt, updatedAt }) {
  await db.run(
    `INSERT INTO lessons (
      id, title, seed_key, grades_1_4, grades_5_9, grades_10_11, students, slides, questions, created_at, updated_at
    ) VALUES (?, ?, ?, 0, 1, 0, 0, ?, ?, ?, ?)`,
    id,
    title,
    seedKey,
    JSON.stringify(slides),
    JSON.stringify(questions),
    createdAt,
    updatedAt,
  )
}

export async function listAllLessons() {
  return db.all('SELECT * FROM lessons ORDER BY created_at DESC')
}

// band подставляется в SQL как имя колонки, поэтому допускаются только ключи групп.
export async function listLessonsForBand(band) {
  if (!GROUP_KEYS.includes(band)) throw new Error(`Неизвестная группа: ${band}`)
  return db.all(`SELECT * FROM lessons WHERE ${band} = 1 ORDER BY created_at DESC`)
}

export async function findLesson(id) {
  return db.get('SELECT * FROM lessons WHERE id = ?', id)
}

export async function findLessonGroups(id) {
  return db.get('SELECT grades_1_4, grades_5_9, grades_10_11, students FROM lessons WHERE id = ?', id)
}

export async function lessonExists(id) {
  return db.get('SELECT id FROM lessons WHERE id = ?', id)
}

export async function insertLesson({ id, title, seedKey, groups, format, slides, questions, createdAt, updatedAt }) {
  await db.run(
    `INSERT INTO lessons (
      id, title, seed_key, grades_1_4, grades_5_9, grades_10_11, students, format, slides, questions, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    title,
    seedKey,
    ...groupNumbers(groups),
    format,
    JSON.stringify(slides),
    JSON.stringify(questions),
    createdAt,
    updatedAt,
  )
}

// Переход на презентацию стирает данные о видео; у видеоурока они сохраняются.
export async function updateLesson(id, { title, groups, format, slides, questions, updatedAt }) {
  await db.run(
    `UPDATE lessons
     SET title = ?, grades_1_4 = ?, grades_5_9 = ?, grades_10_11 = ?, students = ?, format = ?,
         video_mime = CASE WHEN ? = 'slides' THEN NULL ELSE video_mime END,
         video_name = CASE WHEN ? = 'slides' THEN NULL ELSE video_name END,
         slides = ?, questions = ?, updated_at = ?
     WHERE id = ?`,
    title,
    ...groupNumbers(groups),
    format,
    format,
    format,
    JSON.stringify(slides),
    JSON.stringify(questions),
    updatedAt,
    id,
  )
}

export async function setLessonVideo(id, { mime, name, updatedAt }) {
  await db.run(
    'UPDATE lessons SET video_mime = ?, video_name = ?, updated_at = ? WHERE id = ?',
    mime,
    name,
    updatedAt,
    id,
  )
}

export async function deleteLesson(id) {
  await db.run('DELETE FROM lessons WHERE id = ?', id)
}
