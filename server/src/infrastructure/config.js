import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const DATA_DIR = path.join(SERVER_DIR, 'data')

dotenv.config({ path: path.join(SERVER_DIR, '.env') })

// Геттеры читают process.env при каждом обращении: часть переменных меняют уже после импорта модулей (так делают тесты).
export const config = {
  get port() {
    return Number(process.env.PORT || 3001)
  },
  get sessionSecret() {
    return process.env.SESSION_SECRET || 'testonline-dev-secret'
  },
  get cookieSecure() {
    return process.env.COOKIE_SECURE === '1'
  },
  get trustProxy() {
    return process.env.TRUST_PROXY === '1'
  },
  // MEDIA_ACCEL=1: Node только проверяет права, файл отдаёт Nginx по внутреннему адресу /media-internal/.
  get mediaAccel() {
    return process.env.MEDIA_ACCEL === '1'
  },
  get postgresUrl() {
    return process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || ''
  },
  // PG_SSL=0 — Postgres рядом (docker compose, локальная сеть), без TLS.
  get pgSslDisabled() {
    return process.env.PG_SSL === '0'
  },
  get pgPoolMax() {
    return Number(process.env.PG_POOL_MAX) > 0 ? Number(process.env.PG_POOL_MAX) : 20
  },
  get mediaDir() {
    if (process.env.MEDIA_DIR) return path.resolve(process.env.MEDIA_DIR)
    return path.join(DATA_DIR, 'media')
  },
  get lessonMaxAttempts() {
    const value = Number(process.env.LESSON_MAX_ATTEMPTS)
    return Number.isInteger(value) && value > 0 ? value : 1
  },
  get superLogin() {
    return process.env.SUPER_LOGIN || 'super'
  },
  get superPassword() {
    return process.env.SUPER_PASSWORD || 'super12345'
  },
  clientDist: path.join(SERVER_DIR, '..', 'client', 'dist'),
}
