import { db } from '../infrastructure/db/index.js'

export async function count(sql, ...params) {
  const row = await db.get(sql, ...params)
  return Number(row?.n || 0)
}

export function placeholders(values) {
  return values.map(() => '?').join(',')
}

export async function countsById(sql, ids) {
  if (!ids.length) return new Map()
  const rows = await db.all(sql, ...ids)
  return new Map(rows.map((row) => [row.id, Number(row.n)]))
}
