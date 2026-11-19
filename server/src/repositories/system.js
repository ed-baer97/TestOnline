import { closeDb, db } from '../infrastructure/db/index.js'

export async function pingDb() {
  await db.get('SELECT 1 AS ok')
}

export async function closeDatabase() {
  await closeDb()
}
