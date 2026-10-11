import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Каждый файл тестов работает со своей пустой базой. По умолчанию это SQLite во временной папке.
// С TEST_POSTGRES_URL (строка подключения к служебной базе, например .../postgres) те же тесты
// идут на Postgres: на файл создаётся отдельная база testonline_*, медиа пишутся во временную папку.
export async function useTestDatabase(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `testonline-${name}-`))
  const adminUrl = process.env.TEST_POSTGRES_URL
  if (!adminUrl) {
    process.env.DB_PATH = path.join(dir, `${name}.sqlite`)
    return dir
  }
  const { default: pg } = await import('pg')
  const database = `testonline_${name.replace(/\W/g, '_')}_${crypto.randomBytes(4).toString('hex')}`
  const client = new pg.Client({ connectionString: adminUrl })
  await client.connect()
  try {
    await client.query(`CREATE DATABASE ${database}`)
  } finally {
    await client.end()
  }
  const url = new URL(adminUrl)
  url.pathname = `/${database}`
  delete process.env.DB_PATH
  process.env.POSTGRES_URL = url.toString()
  process.env.MEDIA_DIR = path.join(dir, 'media')
  return dir
}

// Ведущих через API не создают, поэтому характеризационные тесты заводят их напрямую.
export async function createHost(login, password) {
  const { registerUser } = await import('../../src/db.js')
  return registerUser({ login, password })
}

export async function rawDb() {
  const { db } = await import('../../src/db.js')
  return db
}
