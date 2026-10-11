import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after } from 'node:test'

// Каждый файл тестов работает со своей пустой базой Postgres. TEST_POSTGRES_URL — служебная база, где можно
// создавать базы (например .../postgres): на файл создаётся testonline_*, а после его тестов она удаляется.
// Медиа пишутся во временную папку.
export async function useTestDatabase(name) {
  const adminUrl = process.env.TEST_POSTGRES_URL
  if (!adminUrl) {
    throw new Error('Тестам сервера нужен Postgres: задайте TEST_POSTGRES_URL, например postgresql://postgres:postgres@localhost:5432/postgres')
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `testonline-${name}-`))
  const database = `testonline_${name.replace(/\W/g, '_')}_${crypto.randomBytes(4).toString('hex')}`
  await adminQuery(adminUrl, `CREATE DATABASE ${database}`)
  after(async () => {
    const { closeDb } = await import('../../src/infrastructure/db/index.js')
    await closeDb()
    await adminQuery(adminUrl, `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`)
  })
  const url = new URL(adminUrl)
  url.pathname = `/${database}`
  process.env.POSTGRES_URL = url.toString()
  process.env.MEDIA_DIR = path.join(dir, 'media')
  return dir
}

async function adminQuery(adminUrl, sql) {
  const { default: pg } = await import('pg')
  const client = new pg.Client({ connectionString: adminUrl })
  await client.connect()
  try {
    await client.query(sql)
  } finally {
    await client.end()
  }
}

// Ведущих через API не создают, поэтому характеризационные тесты заводят их напрямую.
export async function createHost(login, password) {
  const { registerUser } = await import('../../src/services/accounts.js')
  return registerUser({ login, password })
}

export async function rawDb() {
  const { db } = await import('../../src/infrastructure/db/index.js')
  return db
}
