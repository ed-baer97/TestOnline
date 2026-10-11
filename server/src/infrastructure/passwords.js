import crypto from 'node:crypto'

const KEY_LENGTH = 32

function scrypt(password, salt, length) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, length, (error, key) => (error ? reject(error) : resolve(key)))
  })
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const hash = await scrypt(password, salt, KEY_LENGTH)
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = Buffer.from(parts[1], 'base64url')
  const expected = Buffer.from(parts[2], 'base64url')
  const actual = await scrypt(password, salt, expected.length)
  if (actual.length !== expected.length) return false
  return crypto.timingSafeEqual(actual, expected)
}
