import { config } from '../config.js'
import { openPostgres } from './postgres.js'
import { openSqlite } from './sqlite.js'

// Одна точка доступа к базе: Postgres, если задан POSTGRES_URL / DATABASE_URL, иначе SQLite.
// Обе реализации отдают get / all / run с плейсхолдерами `?`; соединение открывается при первом запросе.
let opened
function ready() {
  if (!opened) {
    const postgresUrl = config.postgresUrl
    opened = (postgresUrl ? openPostgres(postgresUrl) : openSqlite(config.sqliteFile)).catch((error) => {
      opened = null
      throw error
    })
  }
  return opened
}

export const db = {
  get: async (...args) => (await ready()).get(...args),
  all: async (...args) => (await ready()).all(...args),
  run: async (...args) => (await ready()).run(...args),
}

export function isUniqueViolation(error) {
  return error?.code === '23505' || String(error?.message || '').includes('UNIQUE')
}
