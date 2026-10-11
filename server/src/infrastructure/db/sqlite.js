import fs from 'node:fs'
import path from 'node:path'

export async function openSqlite(dbFile) {
  const { DatabaseSync } = await import('node:sqlite')
  fs.mkdirSync(path.dirname(dbFile), { recursive: true })
  const db = new DatabaseSync(dbFile)
  // Встроенная lower() в SQLite меняет регистр только у латиницы, а запросы к users сравнивают логины
  // и ищут тестируемых через lower(). Замена работает как lower() в Postgres, в том числе для кириллицы.
  db.function('lower', { deterministic: true }, (value) => (value == null ? null : String(value).toLowerCase()))
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
    CREATE TABLE IF NOT EXISTS live_rooms (
      code TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)
  const ensureColumn = (table, column, statement) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all()
    if (!columns.some((item) => item.name === column)) db.exec(statement)
  }
  ensureColumn('quizzes', 'user_id', 'ALTER TABLE quizzes ADD COLUMN user_id TEXT')
  ensureColumn('results', 'user_id', 'ALTER TABLE results ADD COLUMN user_id TEXT')
  ensureColumn('results', 'started_at', 'ALTER TABLE results ADD COLUMN started_at TEXT')
  ensureColumn('users', 'role', "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'host'")
  ensureColumn('users', 'region_id', 'ALTER TABLE users ADD COLUMN region_id TEXT')
  ensureColumn('users', 'organization_id', 'ALTER TABLE users ADD COLUMN organization_id TEXT')
  ensureColumn('users', 'display_name', 'ALTER TABLE users ADD COLUMN display_name TEXT')
  ensureColumn('users', 'class_id', 'ALTER TABLE users ADD COLUMN class_id TEXT')
  db.exec(`
    CREATE TABLE IF NOT EXISTS regions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      region_id TEXT NOT NULL,
      name TEXT NOT NULL,
      grades_1_4 INTEGER NOT NULL DEFAULT 0,
      grades_5_9 INTEGER NOT NULL DEFAULT 0,
      grades_10_11 INTEGER NOT NULL DEFAULT 0,
      students INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      band TEXT NOT NULL,
      grade INTEGER,
      track_id TEXT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS organizations_region ON organizations (region_id);
    CREATE INDEX IF NOT EXISTS classes_org ON classes (organization_id);
    CREATE INDEX IF NOT EXISTS tracks_org ON tracks (organization_id);
    CREATE INDEX IF NOT EXISTS users_org_role ON users (organization_id, role);
    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      seed_key TEXT,
      grades_1_4 INTEGER NOT NULL DEFAULT 0,
      grades_5_9 INTEGER NOT NULL DEFAULT 0,
      grades_10_11 INTEGER NOT NULL DEFAULT 0,
      students INTEGER NOT NULL DEFAULT 0,
      slides TEXT NOT NULL,
      questions TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS lessons_seed_key ON lessons (seed_key) WHERE seed_key IS NOT NULL;
    CREATE TABLE IF NOT EXISTS lesson_files (
      id TEXT PRIMARY KEY,
      lesson_id TEXT NOT NULL,
      mime TEXT NOT NULL,
      data_base64 TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS lesson_files_lesson ON lesson_files (lesson_id);
    CREATE TABLE IF NOT EXISTS lesson_attempts (
      id TEXT PRIMARY KEY,
      lesson_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      total INTEGER NOT NULL,
      finished_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS lesson_attempts_user ON lesson_attempts (lesson_id, user_id);
    CREATE INDEX IF NOT EXISTS lesson_attempts_by_user ON lesson_attempts (user_id, lesson_id);
    CREATE INDEX IF NOT EXISTS users_class ON users (class_id);
  `)
  ensureColumn('lessons', 'format', "ALTER TABLE lessons ADD COLUMN format TEXT NOT NULL DEFAULT 'slides'")
  ensureColumn('lessons', 'video_mime', 'ALTER TABLE lessons ADD COLUMN video_mime TEXT')
  ensureColumn('lessons', 'video_name', 'ALTER TABLE lessons ADD COLUMN video_name TEXT')
  ensureColumn('lesson_attempts', 'answers', 'ALTER TABLE lesson_attempts ADD COLUMN answers TEXT')
  return {
    get: async (sql, ...params) => db.prepare(sql).get(...params),
    all: async (sql, ...params) => db.prepare(sql).all(...params),
    run: async (sql, ...params) => db.prepare(sql).run(...params),
  }
}
