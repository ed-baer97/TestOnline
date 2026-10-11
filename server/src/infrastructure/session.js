import crypto from 'node:crypto'
import { config } from './config.js'

const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000

// Токен сессии: base64url(JSON { userId, exp }) + '.' + HMAC-SHA256 от SESSION_SECRET.
export function signSession(userId) {
  const data = Buffer.from(JSON.stringify({ userId, exp: Date.now() + SESSION_TTL_MS })).toString('base64url')
  const sig = crypto.createHmac('sha256', config.sessionSecret).update(data).digest('base64url')
  return `${data}.${sig}`
}

export function readSession(token) {
  if (!token || !token.includes('.')) return null
  const [data, sig] = token.split('.')
  const expected = crypto.createHmac('sha256', config.sessionSecret).update(data).digest('base64url')
  const left = Buffer.from(sig)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString())
    if (!payload?.exp || payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}
