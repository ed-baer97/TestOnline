import pg from 'pg'
import { config } from '../config.js'

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      login TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS users_login_lower ON users (lower(login))',
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'host'`,
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS region_id TEXT',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id TEXT',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS class_id TEXT',
  `CREATE TABLE IF NOT EXISTS regions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      region_id TEXT NOT NULL,
      name TEXT NOT NULL,
      grades_1_4 INTEGER NOT NULL DEFAULT 0,
      grades_5_9 INTEGER NOT NULL DEFAULT 0,
      grades_10_11 INTEGER NOT NULL DEFAULT 0,
      students INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      band TEXT NOT NULL,
      grade INTEGER,
      track_id TEXT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
  'CREATE INDEX IF NOT EXISTS organizations_region ON organizations (region_id)',
  'CREATE INDEX IF NOT EXISTS classes_org ON classes (organization_id)',
  'CREATE INDEX IF NOT EXISTS tracks_org ON tracks (organization_id)',
  'CREATE INDEX IF NOT EXISTS users_org_role ON users (organization_id, role)',
  `CREATE TABLE IF NOT EXISTS lessons (
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
    )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS lessons_seed_key ON lessons (seed_key) WHERE seed_key IS NOT NULL',
  `CREATE TABLE IF NOT EXISTS lesson_sections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      grades_1_4 INTEGER NOT NULL DEFAULT 0,
      grades_5_9 INTEGER NOT NULL DEFAULT 0,
      grades_10_11 INTEGER NOT NULL DEFAULT 0,
      students INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`,
  'ALTER TABLE lesson_sections ADD COLUMN IF NOT EXISTS grades_1_4 INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE lesson_sections ADD COLUMN IF NOT EXISTS grades_5_9 INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE lesson_sections ADD COLUMN IF NOT EXISTS grades_10_11 INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE lesson_sections ADD COLUMN IF NOT EXISTS students INTEGER NOT NULL DEFAULT 0',
  `DO $$
   BEGIN
     IF EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'lesson_sections' AND column_name = 'band'
     ) THEN
       UPDATE lesson_sections SET grades_1_4 = 1 WHERE band = 'grades_1_4' AND grades_1_4 = 0 AND grades_5_9 = 0 AND grades_10_11 = 0 AND students = 0;
       UPDATE lesson_sections SET grades_5_9 = 1 WHERE band = 'grades_5_9' AND grades_1_4 = 0 AND grades_5_9 = 0 AND grades_10_11 = 0 AND students = 0;
       UPDATE lesson_sections SET grades_10_11 = 1 WHERE band = 'grades_10_11' AND grades_1_4 = 0 AND grades_5_9 = 0 AND grades_10_11 = 0 AND students = 0;
       UPDATE lesson_sections SET students = 1 WHERE band = 'students' AND grades_1_4 = 0 AND grades_5_9 = 0 AND grades_10_11 = 0 AND students = 0;
       ALTER TABLE lesson_sections DROP COLUMN band;
     END IF;
   END $$`,
  `CREATE TABLE IF NOT EXISTS lesson_section_lessons (
      section_id TEXT NOT NULL,
      lesson_id TEXT NOT NULL PRIMARY KEY,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
  'CREATE INDEX IF NOT EXISTS lesson_section_lessons_section ON lesson_section_lessons (section_id)',
  `CREATE TABLE IF NOT EXISTS lesson_files (
      id TEXT PRIMARY KEY,
      lesson_id TEXT NOT NULL,
      mime TEXT NOT NULL,
      data_base64 TEXT NOT NULL DEFAULT ''
    )`,
  'CREATE INDEX IF NOT EXISTS lesson_files_lesson ON lesson_files (lesson_id)',
  `ALTER TABLE lesson_files ALTER COLUMN data_base64 SET DEFAULT ''`,
  `CREATE TABLE IF NOT EXISTS lesson_attempts (
      id TEXT PRIMARY KEY,
      lesson_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      total INTEGER NOT NULL,
      finished_at TEXT NOT NULL
    )`,
  'CREATE INDEX IF NOT EXISTS lesson_attempts_user ON lesson_attempts (lesson_id, user_id)',
  'CREATE INDEX IF NOT EXISTS lesson_attempts_by_user ON lesson_attempts (user_id, lesson_id)',
  'ALTER TABLE lesson_attempts ADD COLUMN IF NOT EXISTS answers TEXT',
  'CREATE INDEX IF NOT EXISTS users_class ON users (class_id)',
  `ALTER TABLE lessons ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'slides'`,
  'ALTER TABLE lessons ADD COLUMN IF NOT EXISTS video_mime TEXT',
  'ALTER TABLE lessons ADD COLUMN IF NOT EXISTS video_name TEXT',
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
  `ALTER TABLE results ADD COLUMN IF NOT EXISTS access TEXT NOT NULL DEFAULT 'public'`,
  'ALTER TABLE results ADD COLUMN IF NOT EXISTS organization_id TEXT',
  'ALTER TABLE results ADD COLUMN IF NOT EXISTS class_id TEXT',
  'ALTER TABLE results ADD COLUMN IF NOT EXISTS band TEXT',
  `CREATE TABLE IF NOT EXISTS live_rooms (
      code TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  'ALTER TABLE regions ADD COLUMN IF NOT EXISTS name_kk TEXT',
  'ALTER TABLE organizations ADD COLUMN IF NOT EXISTS name_kk TEXT',
  'ALTER TABLE organizations ADD COLUMN IF NOT EXISTS district_id TEXT',
  'ALTER TABLE lessons ADD COLUMN IF NOT EXISTS title_kk TEXT',
  `ALTER TABLE lessons ADD COLUMN IF NOT EXISTS questions_kk TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE lesson_attempts ADD COLUMN IF NOT EXISTS lang TEXT NOT NULL DEFAULT 'ru'`,
  `CREATE TABLE IF NOT EXISTS districts (
      id TEXT PRIMARY KEY,
      region_id TEXT NOT NULL,
      name TEXT NOT NULL,
      name_kk TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`,
  'CREATE INDEX IF NOT EXISTS districts_region ON districts (region_id)',
  `CREATE TABLE IF NOT EXISTS app_seeds (
      key TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`,
]

function toPg(sql) {
  let index = 0
  return sql.replace(/\?/g, () => `$${++index}`)
}

function wrapQueryable(client) {
  return {
    get: async (sql, ...params) => (await client.query(toPg(sql), params)).rows[0],
    all: async (sql, ...params) => (await client.query(toPg(sql), params)).rows,
    run: async (sql, ...params) => ({ changes: (await client.query(toPg(sql), params)).rowCount }),
  }
}

export async function openPostgres(postgresUrl) {
  const plain = config.pgSslDisabled || /localhost|127\.0\.0\.1/.test(postgresUrl)
  const ssl = plain ? false : (process.env.PG_SSL_NO_VERIFY === '1' ? { rejectUnauthorized: false } : true)
  const pool = new pg.Pool({
    connectionString: postgresUrl,
    max: config.pgPoolMax,
    ssl,
  })
  pool.on('error', (error) => {
    console.error('Postgres pool error', error)
  })
  for (const statement of SCHEMA) await pool.query(statement)
  return {
    ...wrapQueryable(pool),
    tx: async (fn) => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await fn(wrapQueryable(client))
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}
