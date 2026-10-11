import { db } from '../infrastructure/db/index.js'

// Снимок живой комнаты (JSON). По нему комната поднимается после перезапуска процесса.
export async function saveLiveRoom(code, payload, updatedAt) {
  await db.run(
    `INSERT INTO live_rooms (code, payload, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
    code,
    payload,
    updatedAt,
  )
}

export async function readLiveRoom(code) {
  const row = await db.get('SELECT payload FROM live_rooms WHERE code = ?', code)
  return row?.payload || null
}

export async function deleteLiveRoom(code) {
  await db.run('DELETE FROM live_rooms WHERE code = ?', code)
}
