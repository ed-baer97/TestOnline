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
  return db.all('SELECT * FROM lessons ORDER BY COALESCE(sort_order, 0) ASC, created_at ASC, id ASC')
}

// band подставляется в SQL как имя колонки, поэтому допускаются только ключи групп.
export async function listLessonsForBand(band) {
  if (!GROUP_KEYS.includes(band)) throw new Error(`Неизвестная группа: ${band}`)
  return db.all(`SELECT * FROM lessons WHERE ${band} = 1 ORDER BY COALESCE(sort_order, 0) ASC, created_at ASC, id ASC`)
}

export async function listLessonsForBands(bands) {
  const valid = bands.filter((band) => GROUP_KEYS.includes(band))
  if (valid.length === 0) return []
  return db.all(
    `SELECT * FROM lessons WHERE (${valid.map((band) => `${band} = 1`).join(' OR ')}) ORDER BY COALESCE(sort_order, 0) ASC, created_at ASC, id ASC`,
  )
}

export async function nextLessonSortOrder() {
  const row = await db.get('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM lessons')
  return Number(row?.n || 0)
}

export async function setLessonSortOrder(id, sortOrder) {
  await db.run('UPDATE lessons SET sort_order = ? WHERE id = ?', sortOrder, id)
}

export async function listLessonsInBucket(sectionId = null) {
  if (sectionId) {
    return db.all(
      `SELECT l.id
       FROM lessons l
       JOIN lesson_section_lessons link ON link.lesson_id = l.id
       WHERE link.section_id = ?
       ORDER BY COALESCE(l.sort_order, link.sort_order, 0) ASC, l.created_at ASC, l.id ASC`,
      sectionId,
    )
  }
  return db.all(
    `SELECT l.id
     FROM lessons l
     LEFT JOIN lesson_section_lessons link ON link.lesson_id = l.id
     WHERE link.section_id IS NULL
     ORDER BY COALESCE(l.sort_order, 0) ASC, l.created_at ASC, l.id ASC`,
  )
}

export async function saveLessonOrder(orderedIds, sectionId = null) {
  await db.tx(async (tx) => {
    for (const [index, id] of orderedIds.entries()) {
      await tx.run('UPDATE lessons SET sort_order = ? WHERE id = ?', index, id)
      if (sectionId) {
        await tx.run(
          'UPDATE lesson_section_lessons SET sort_order = ? WHERE section_id = ? AND lesson_id = ?',
          index,
          sectionId,
          id,
        )
      }
    }
  })
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

export async function insertLesson({ id, title, titleKk = '', seedKey, groups, format, slides, questions, slidesKk = [], questionsKk = [], sortOrder = 0, createdAt, updatedAt }) {
  await db.run(
    `INSERT INTO lessons (
      id, title, title_kk, seed_key, grades_1_4, grades_5_9, grades_10_11, students, format, slides, questions, slides_kk, questions_kk, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    sortOrder,
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
