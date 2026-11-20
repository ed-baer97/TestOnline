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
export async function insertSeedLesson({ id, title, titleKk = '', seedKey, slides, questions, slidesKk = [], questionsKk = [], createdAt, updatedAt }) {
  await db.run(
    `INSERT INTO lessons (
      id, title, title_kk, seed_key, grades_1_4, grades_5_9, grades_10_11, students, slides, questions, slides_kk, questions_kk, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 0, 1, 0, 0, ?, ?, ?, ?, ?, ?)`,
    id,
    title,
    titleKk,
    seedKey,
    JSON.stringify(slides),
    JSON.stringify(questions),
    JSON.stringify(slidesKk),
    JSON.stringify(questionsKk),
    createdAt,
    updatedAt,
  )
}

export async function fillSeedLessonKazakh(id, { titleKk, slidesKk, questionsKk }) {
  await db.run(
    `UPDATE lessons
     SET title_kk = ?, slides_kk = ?, questions_kk = ?
     WHERE id = ? AND (slides_kk IS NULL OR slides_kk = '' OR slides_kk = '[]')`,
    titleKk,
    JSON.stringify(slidesKk),
    JSON.stringify(questionsKk),
    id,
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

export async function insertLesson({ id, title, titleKk = '', seedKey, groups, format, slides, questions, slidesKk = [], questionsKk = [], createdAt, updatedAt }) {
  await db.run(
    `INSERT INTO lessons (
      id, title, title_kk, seed_key, grades_1_4, grades_5_9, grades_10_11, students, format, slides, questions, slides_kk, questions_kk, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    title,
    titleKk,
    seedKey,
    ...groupNumbers(groups),
    format,
    JSON.stringify(slides),
    JSON.stringify(questions),
    JSON.stringify(slidesKk),
    JSON.stringify(questionsKk),
    createdAt,
    updatedAt,
  )
}

// Переход на презентацию стирает данные о видео; у видеоурока они сохраняются.
export async function updateLesson(id, { title, titleKk = '', groups, format, slides, questions, slidesKk = [], questionsKk = [], updatedAt }) {
  await db.run(
    `UPDATE lessons
     SET title = ?, title_kk = ?, grades_1_4 = ?, grades_5_9 = ?, grades_10_11 = ?, students = ?, format = ?,
         video_mime = CASE WHEN ? = 'slides' THEN NULL ELSE video_mime END,
         video_name = CASE WHEN ? = 'slides' THEN NULL ELSE video_name END,
         video_mime_kk = CASE WHEN ? = 'slides' THEN NULL ELSE video_mime_kk END,
         video_name_kk = CASE WHEN ? = 'slides' THEN NULL ELSE video_name_kk END,
         slides = ?, questions = ?, slides_kk = ?, questions_kk = ?, updated_at = ?
     WHERE id = ?`,
    title,
    titleKk,
    ...groupNumbers(groups),
    format,
    format,
    format,
    format,
    format,
    JSON.stringify(slides),
    JSON.stringify(questions),
    JSON.stringify(slidesKk),
    JSON.stringify(questionsKk),
    updatedAt,
    id,
  )
}

export async function setLessonVideo(id, lang, { mime, name, updatedAt }) {
  if (lang === 'kk') {
    await db.run(
      'UPDATE lessons SET video_mime_kk = ?, video_name_kk = ?, updated_at = ? WHERE id = ?',
      mime,
      name,
      updatedAt,
      id,
    )
    return
  }
  await db.run(
    'UPDATE lessons SET video_mime = ?, video_name = ?, updated_at = ? WHERE id = ?',
    mime,
    name,
    updatedAt,
    id,
  )
}

export async function clearLessonVideo(id, lang, updatedAt) {
  if (lang === 'kk') {
    await db.run(
      'UPDATE lessons SET video_mime_kk = NULL, video_name_kk = NULL, updated_at = ? WHERE id = ?',
      updatedAt,
      id,
    )
    return
  }
  await db.run(
    'UPDATE lessons SET video_mime = NULL, video_name = NULL, updated_at = ? WHERE id = ?',
    updatedAt,
    id,
  )
}

export async function deleteLesson(id) {
  await db.run('DELETE FROM lessons WHERE id = ?', id)
}

export async function setLessonGroups(id, groups) {
  await db.run(
    'UPDATE lessons SET grades_1_4 = ?, grades_5_9 = ?, grades_10_11 = ?, students = ? WHERE id = ?',
    ...groupNumbers(groups),
    id,
  )
}
