import crypto from 'node:crypto'
import { fail } from './errors.js'
import { cleanText } from './text.js'

export function normalizeAccount({ login, password }) {
  const name = cleanText(login)
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/.test(name)) fail('Логин: 3–32 символа, латинские буквы, цифры, точка, _ или -')
  const pass = String(password ?? '')
  if (pass.length < 6 || pass.length > 72) fail('Пароль от 6 до 72 символов')
  return { login: name, password: pass }
}

// Пустое значение — пароль не меняется.
export function readPassword(value) {
  if (value == null || String(value) === '') return null
  const pass = String(value)
  if (pass.length < 6 || pass.length > 72) fail('Пароль от 6 до 72 символов')
  return pass
}

export function generatePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  let out = ''
  for (const byte of crypto.randomBytes(8)) out += alphabet[byte % alphabet.length]
  return out
}
