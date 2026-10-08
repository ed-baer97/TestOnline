import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'
import { hashPassword, verifyPassword } from './passwords.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const postgresUrl = process.env.DB_PATH
  ? ''
  : (process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || '')

function toPg(sql) {
  let index = 0
  return sql.replace(/\?/g, () => `$${++index}`)
}

function isUnique(error) {
  return error?.code === '23505' || String(error?.message || '').includes('UNIQUE')
}

function postgresConnectionString(url) {
  if (/[?&]sslmode=/i.test(url)) return url.replace(/([?&])sslmode=[^&]*/gi, '$1sslmode=no-verify')
  return `${url}${url.includes('?') ? '&' : '?'}sslmode=no-verify`
}

async function openDatabase() {
  if (!postgresUrl) {
    if (process.env.VERCEL) {
      const error = new Error('База не подключена: в проекте Vercel нет POSTGRES_URL')
      error.status = 500
      throw error
    }
    return openSqlite()
  }
  const local = /localhost|127\.0\.0\.1/.test(postgresUrl)
  const pool = new pg.Pool({
    connectionString: local ? postgresUrl : postgresConnectionString(postgresUrl),
    max: process.env.VERCEL ? 1 : 3,
    ssl: local ? false : { rejectUnauthorized: false },
  })
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      login TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    'CREATE UNIQUE INDEX IF NOT EXISTS users_login_lower ON users (lower(login))',
    `CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      title TEXT NOT NULL,
      questions TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS results (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      quiz_id TEXT,
      quiz_title TEXT NOT NULL,
      code TEXT NOT NULL,
      players TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT NOT NULL
    )`,
  ]
  for (const statement of statements) await pool.query(statement)
  return {
    get: async (sql, ...params) => (await pool.query(toPg(sql), params)).rows[0],
    all: async (sql, ...params) => (await pool.query(toPg(sql), params)).rows,
    run: async (sql, ...params) => ({ changes: (await pool.query(toPg(sql), params)).rowCount }),
  }
}

async function openSqlite() {
  const { DatabaseSync } = await import('node:sqlite')
  const dataDir = path.join(__dirname, '..', 'data')
  const dbFile = process.env.DB_PATH || path.join(dataDir, 'testonline.sqlite')
  fs.mkdirSync(path.dirname(dbFile), { recursive: true })
  const db = new DatabaseSync(dbFile)
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      login TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      questions TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS results (
      id TEXT PRIMARY KEY,
      quiz_id TEXT,
      quiz_title TEXT NOT NULL,
      code TEXT NOT NULL,
      players TEXT NOT NULL,
      finished_at TEXT NOT NULL
    );
  `)
  const ensureColumn = (table, column, statement) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all()
    if (!columns.some((item) => item.name === column)) db.exec(statement)
  }
  ensureColumn('quizzes', 'user_id', 'ALTER TABLE quizzes ADD COLUMN user_id TEXT')
  ensureColumn('results', 'user_id', 'ALTER TABLE results ADD COLUMN user_id TEXT')
  ensureColumn('results', 'started_at', 'ALTER TABLE results ADD COLUMN started_at TEXT')
  return {
    get: async (sql, ...params) => db.prepare(sql).get(...params),
    all: async (sql, ...params) => db.prepare(sql).all(...params),
    run: async (sql, ...params) => db.prepare(sql).run(...params),
  }
}

let opened
function ready() {
  if (!opened) {
    opened = openDatabase().catch((error) => {
      opened = null
      throw error
    })
  }
  return opened
}

const db = {
  get: async (...args) => (await ready()).get(...args),
  all: async (...args) => (await ready()).all(...args),
  run: async (...args) => (await ready()).run(...args),
}

const DEMO = [
  {
    text: 'Столица Франции?',
    timeLimit: 20,
    correctIndex: 0,
    options: [{ text: 'Париж' }, { text: 'Рим' }, { text: 'Берлин' }, { text: 'Мадрид' }],
  },
  {
    text: 'Сколько планет в Солнечной системе?',
    timeLimit: 20,
    correctIndex: 0,
    options: [{ text: '8' }, { text: '9' }, { text: '7' }, { text: '10' }],
  },
  {
    text: 'Какой газ составляет большую часть воздуха?',
    timeLimit: 20,
    correctIndex: 0,
    options: [{ text: 'Азот' }, { text: 'Кислород' }, { text: 'Углекислый газ' }, { text: 'Водород' }],
  },
  {
    text: 'Сколько будет 7 × 8?',
    timeLimit: 10,
    correctIndex: 0,
    options: [{ text: '56' }, { text: '54' }, { text: '64' }, { text: '48' }],
  },
  {
    text: 'Самый большой океан Земли?',
    timeLimit: 20,
    correctIndex: 0,
    options: [{ text: 'Тихий' }, { text: 'Атлантический' }, { text: 'Индийский' }, { text: 'Северный Ледовитый' }],
  },
]

function mapQuiz(row) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    questions: JSON.parse(row.questions),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function insertDemo(userId) {
  const now = new Date().toISOString()
  const questions = DEMO.map((question) => ({ ...question, id: crypto.randomUUID() }))
  await db.run(
    'INSERT INTO quizzes (id, user_id, title, questions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    crypto.randomUUID(),
    userId,
    'Демо: общий кругозор',
    JSON.stringify(questions),
    now,
    now,
  )
}

export async function registerUser({ login, password }) {
  const first = Number((await db.get('SELECT COUNT(*) AS n FROM users')).n) === 0
  const id = crypto.randomUUID()
  try {
    await db.run(
      'INSERT INTO users (id, login, password_hash, created_at) VALUES (?, ?, ?, ?)',
      id,
      login,
      hashPassword(password),
      new Date().toISOString(),
    )
  } catch (error) {
    if (isUnique(error)) {
      const conflict = new Error('Такой логин уже занят')
      conflict.status = 409
      throw conflict
    }
    throw error
  }
  if (first) {
    await db.run('UPDATE quizzes SET user_id = ? WHERE user_id IS NULL', id)
    await db.run('UPDATE results SET user_id = ? WHERE user_id IS NULL', id)
  }
  const owned = await db.get('SELECT COUNT(*) AS n FROM quizzes WHERE user_id = ?', id)
  if (Number(owned.n) === 0) await insertDemo(id)
  return { id, login }
}

export async function authenticate(login, password) {
  const row = await db.get('SELECT id, login, password_hash FROM users WHERE lower(login) = lower(?)', String(login || '').trim())
  if (!row || !verifyPassword(password, row.password_hash)) return null
  return { id: row.id, login: row.login }
}

export async function getUser(id) {
  const row = await db.get('SELECT id, login FROM users WHERE id = ?', id)
  return row ? { id: row.id, login: row.login } : null
}

export async function listQuizzes(userId) {
  const rows = await db.all('SELECT id, title, questions, updated_at FROM quizzes WHERE user_id = ? ORDER BY updated_at DESC', userId)
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    questionCount: JSON.parse(row.questions).length,
    updatedAt: row.updated_at,
  }))
}

export async function getQuiz(id, userId) {
  const row = await db.get('SELECT * FROM quizzes WHERE id = ? AND user_id = ?', id, userId)
  return row ? mapQuiz(row) : null
}

export async function createQuiz(userId, quiz) {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  await db.run(
    'INSERT INTO quizzes (id, user_id, title, questions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    userId,
    quiz.title,
    JSON.stringify(quiz.questions),
    now,
    now,
  )
  return getQuiz(id, userId)
}

export async function updateQuiz(id, userId, quiz) {
  const now = new Date().toISOString()
  const result = await db.run(
    'UPDATE quizzes SET title = ?, questions = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    quiz.title,
    JSON.stringify(quiz.questions),
    now,
    id,
    userId,
  )
  if (result.changes === 0) return null
  return getQuiz(id, userId)
}

export async function deleteQuiz(id, userId) {
  const result = await db.run('DELETE FROM quizzes WHERE id = ? AND user_id = ?', id, userId)
  return result.changes > 0
}

export async function saveResult({ userId, quizId, quizTitle, code, players, startedAt }) {
  await db.run(
    'INSERT INTO results (id, user_id, quiz_id, quiz_title, code, players, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    crypto.randomUUID(),
    userId,
    quizId,
    quizTitle,
    code,
    JSON.stringify(players),
    startedAt ? new Date(startedAt).toISOString() : null,
    new Date().toISOString(),
  )
}

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

function averageScore(players) {
  if (!players.length) return null
  const total = players.reduce((sum, player) => sum + (Number(player.score) || 0), 0)
  return Math.round(total / players.length)
}

async function loadResults(userId, quizId) {
  const sql = quizId
    ? 'SELECT id, quiz_id, quiz_title, code, players, started_at, finished_at FROM results WHERE user_id = ? AND quiz_id = ? ORDER BY finished_at DESC'
    : 'SELECT id, quiz_id, quiz_title, code, players, started_at, finished_at FROM results WHERE user_id = ? ORDER BY finished_at DESC'
  const rows = quizId ? await db.all(sql, userId, quizId) : await db.all(sql, userId)
  return rows.map(mapResult)
}

function summarizeResult(result) {
  return {
    id: result.id,
    quizId: result.quizId,
    title: result.title,
    code: result.code,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    playerCount: result.players.length,
    averageScore: averageScore(result.players),
    top: result.players[0] ? { name: result.players[0].name, score: result.players[0].score } : null,
  }
}

export async function statsOverview(userId) {
  const quizzes = await listQuizzes(userId)
  const results = await loadResults(userId)
  const scores = results.flatMap((result) => result.players.map((player) => Number(player.score) || 0))
  const byQuiz = new Map(quizzes.map((quiz) => [quiz.id, {
    quizId: quiz.id,
    title: quiz.title,
    questionCount: quiz.questionCount,
    runs: 0,
    participants: 0,
    scores: [],
  }]))
  for (const result of results) {
    const key = result.quizId || `title:${result.title}`
    if (!byQuiz.has(key)) {
      byQuiz.set(key, { quizId: result.quizId, title: result.title, questionCount: null, runs: 0, participants: 0, scores: [] })
    }
    const bucket = byQuiz.get(key)
    bucket.runs += 1
    bucket.participants += result.players.length
    bucket.scores.push(...result.players.map((player) => Number(player.score) || 0))
  }
  return {
    quizzes: quizzes.length,
    runs: results.length,
    participants: results.reduce((sum, result) => sum + result.players.length, 0),
    averageScore: averageScore(scores.map((score) => ({ score }))),
    byQuiz: [...byQuiz.values()]
      .map((bucket) => ({
        quizId: bucket.quizId,
        title: bucket.title,
        questionCount: bucket.questionCount,
        runs: bucket.runs,
        participants: bucket.participants,
        averageScore: averageScore(bucket.scores.map((score) => ({ score }))),
      }))
      .sort((a, b) => b.runs - a.runs || a.title.localeCompare(b.title, 'ru')),
    recent: results.slice(0, 8).map(summarizeResult),
    history: results.map(summarizeResult),
  }
}

export async function quizStats(userId, quizId) {
  const quiz = await getQuiz(quizId, userId)
  if (!quiz) return null
  const results = await loadResults(userId, quizId)
  const questions = new Map()
  const order = []
  const bucketFor = (key, text) => {
    if (!questions.has(key)) {
      questions.set(key, { text, correct: 0, total: 0 })
      order.push(key)
    }
    return questions.get(key)
  }
  for (const question of quiz.questions) bucketFor(question.id || question.text, question.text)
  for (const result of results) {
    for (const player of result.players) {
      for (const answer of player.answers || []) {
        const bucket = bucketFor(answer.questionId || answer.question, answer.question)
        bucket.total += 1
        if (answer.ok) bucket.correct += 1
      }
    }
  }
  const players = results.flatMap((result) => result.players)
  return {
    id: quiz.id,
    title: quiz.title,
    questionCount: quiz.questions.length,
    runs: results.length,
    participants: players.length,
    averageScore: averageScore(players),
    questions: order.map((key) => {
      const item = questions.get(key)
      return {
        text: item.text,
        correct: item.correct,
        total: item.total,
        rate: item.total ? Math.round((item.correct / item.total) * 100) : null,
      }
    }),
    sessions: results.map((result) => ({
      id: result.id,
      code: result.code,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      playerCount: result.players.length,
      averageScore: averageScore(result.players),
      topScore: result.players[0]?.score ?? null,
      players: result.players.map((player) => ({
        name: player.name,
        score: player.score,
        rank: player.rank,
        answers: Array.isArray(player.answers) ? player.answers : null,
      })),
    })),
  }
}

export async function listResults(userId) {
  const rows = await db.all('SELECT quiz_title, code, players, finished_at FROM results WHERE user_id = ? ORDER BY finished_at DESC LIMIT 8', userId)
  return rows.map((row) => ({
    title: row.quiz_title,
    code: row.code,
    players: JSON.parse(row.players),
    finishedAt: row.finished_at,
  }))
}
