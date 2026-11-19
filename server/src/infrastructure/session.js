import crypto from 'node:crypto'
import { config } from './config.js'

export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000

export function sessionFingerprint(passwordHash) {
  return crypto
    .createHmac('sha256', config.sessionSecret)
    .update(String(passwordHash || ''))
    .digest('base64url')
    .slice(0, 16)
}

// Токен сессии: base64url(JSON { userId, exp, ver }) + '.' + HMAC-SHA256 от SESSION_SECRET.
export function signSession(userId, passwordHash) {
  const data = Buffer.from(
    JSON.stringify({ userId, exp: Date.now() + SESSION_TTL_MS, ver: sessionFingerprint(passwordHash) }),
  ).toString('base64url')
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

export function sessionMatchesPassword(session, passwordHash) {
  if (typeof session?.ver !== 'string' || !session.ver) return false
  const expected = sessionFingerprint(passwordHash)
  const left = Buffer.from(session.ver)
  const right = Buffer.from(expected)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}
