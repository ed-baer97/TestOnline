import { config } from '../config.js'
import { openPostgres } from './postgres.js'

// Одна точка доступа к Postgres: get / all / run принимают плейсхолдеры `?`; пул открывается при первом запросе.
let opened
function ready() {
  if (!opened) {
    const postgresUrl = config.postgresUrl
    if (!postgresUrl) throw new Error('Не задан POSTGRES_URL: укажите строку подключения к Postgres (образец — server/.env.example)')
    opened = openPostgres(postgresUrl).catch((error) => {
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

export async function closeDb() {
  const current = opened
  opened = null
  if (current) await (await current).close()
}

export function isUniqueViolation(error) {
  return error?.code === '23505'
}
