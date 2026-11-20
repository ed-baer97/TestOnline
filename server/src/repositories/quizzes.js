import { db } from '../infrastructure/db/index.js'

function quizLang(value) {
  return value === 'kk' ? 'kk' : 'ru'
}

function mapQuiz(row) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    lang: quizLang(row.lang),
    questions: JSON.parse(row.questions),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function insertQuiz({ id, userId, title, questions, lang = 'ru', createdAt, updatedAt }) {
  await db.run(
    'INSERT INTO quizzes (id, user_id, title, questions, lang, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id,
    userId,
    title,
    JSON.stringify(questions),
    quizLang(lang),
    createdAt,
    updatedAt,
  )
}

function quizSummary(row) {
  return {
    id: row.id,
    title: row.title,
    lang: quizLang(row.lang),
    questionCount: JSON.parse(row.questions).length,
    updatedAt: row.updated_at,
  }
}

export async function listQuizSummaries(userId) {
  const rows = await db.all('SELECT id, title, lang, questions, updated_at FROM quizzes WHERE user_id = ? ORDER BY updated_at DESC', userId)
  return rows.map(quizSummary)
}

export async function listSuperQuizSummaries() {
  const rows = await db.all(
    `SELECT q.id, q.title, q.lang, q.questions, q.updated_at
     FROM quizzes q
     JOIN users u ON u.id = q.user_id
     WHERE u.role = 'super'
     ORDER BY q.updated_at DESC`,
  )
  return rows.map(quizSummary)
}

export async function findSuperQuiz(id) {
  const row = await db.get(
    `SELECT q.* FROM quizzes q
     JOIN users u ON u.id = q.user_id
     WHERE q.id = ? AND u.role = 'super'`,
    id,
  )
  return row ? mapQuiz(row) : null
}

export async function findQuiz(id, userId) {
  const row = await db.get('SELECT * FROM quizzes WHERE id = ? AND user_id = ?', id, userId)
  return row ? mapQuiz(row) : null
}

export async function updateQuiz(id, userId, { title, questions, updatedAt }) {
  const result = await db.run(
    'UPDATE quizzes SET title = ?, questions = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    title,
    JSON.stringify(questions),
    updatedAt,
    id,
    userId,
  )
  return result.changes
}

export async function deleteQuiz(id, userId) {
  const result = await db.run('DELETE FROM quizzes WHERE id = ? AND user_id = ?', id, userId)
  return result.changes
}

export async function countQuizzes(userId) {
  const row = await db.get('SELECT COUNT(*) AS n FROM quizzes WHERE user_id = ?', userId)
  return Number(row.n)
}

export async function claimOrphanQuizzes(userId) {
  await db.run('UPDATE quizzes SET user_id = ? WHERE user_id IS NULL', userId)
}
