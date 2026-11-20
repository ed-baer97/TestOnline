import { db } from '../infrastructure/db/index.js'

export async function listUserAttempts(userId) {
  return db.all(
    `SELECT lesson_id, score, total FROM lesson_attempts
     WHERE user_id = ? ORDER BY score DESC, finished_at DESC`,
    userId,
  )
}

export async function listAttempts(lessonId, userId) {
  return db.all(
    `SELECT id, score, total, answers, finished_at, lang FROM lesson_attempts
     WHERE lesson_id = ? AND user_id = ? ORDER BY finished_at ASC, id ASC`,
    lessonId,
    userId,
  )
}

export async function insertAttempt({ id, lessonId, userId, score, total, finishedAt, answers, lang = 'ru' }) {
  await db.run(
    `INSERT INTO lesson_attempts (id, lesson_id, user_id, score, total, finished_at, answers, lang)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    lessonId,
    userId,
    score,
    total,
    finishedAt,
    JSON.stringify(answers),
    lang,
  )
}

export async function deleteAttempt(id) {
  await db.run('DELETE FROM lesson_attempts WHERE id = ?', id)
}

export async function deleteLessonAttempts(lessonId) {
  await db.run('DELETE FROM lesson_attempts WHERE lesson_id = ?', lessonId)
}
