import { db } from '../infrastructure/db/index.js'

export async function countUsers() {
  const row = await db.get('SELECT COUNT(*) AS n FROM users')
  return Number(row.n)
}

export async function insertHost({ id, login, passwordHash, createdAt }) {
  await db.run(
    'INSERT INTO users (id, login, password_hash, created_at) VALUES (?, ?, ?, ?)',
    id,
    login,
    passwordHash,
    createdAt,
  )
}

export async function findCredentials(login) {
  return db.get('SELECT id, login, password_hash, role FROM users WHERE lower(login) = lower(?)', login)
}
