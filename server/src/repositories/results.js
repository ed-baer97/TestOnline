import { db } from '../infrastructure/db/index.js'

function mapResult(row) {
  return {
    id: row.id,
    quizId: row.quiz_id,
    title: row.quiz_title,
    code: row.code,
    players: JSON.parse(row.players),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }
}

export async function insertResult({ id, userId, quizId, quizTitle, code, players, startedAt, finishedAt }) {
  await db.run(
    'INSERT INTO results (id, user_id, quiz_id, quiz_title, code, players, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    userId,
    quizId,
    quizTitle,
    code,
    JSON.stringify(players),
    startedAt,
    finishedAt,
  )
}

export async function listResults(userId, quizId) {
  const sql = quizId
    ? 'SELECT id, quiz_id, quiz_title, code, players, started_at, finished_at FROM results WHERE user_id = ? AND quiz_id = ? ORDER BY finished_at DESC'
    : 'SELECT id, quiz_id, quiz_title, code, players, started_at, finished_at FROM results WHERE user_id = ? ORDER BY finished_at DESC'
  const rows = quizId ? await db.all(sql, userId, quizId) : await db.all(sql, userId)
  return rows.map(mapResult)
}

export async function listRecentResults(userId) {
  const rows = await db.all('SELECT quiz_title, code, players, finished_at FROM results WHERE user_id = ? ORDER BY finished_at DESC LIMIT 8', userId)
  return rows.map((row) => ({
    title: row.quiz_title,
    code: row.code,
    players: JSON.parse(row.players),
    finishedAt: row.finished_at,
  }))
}

export async function claimOrphanResults(userId) {
  await db.run('UPDATE results SET user_id = ? WHERE user_id IS NULL', userId)
}
