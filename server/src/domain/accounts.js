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

export function normalizeEmail(value) {
  const email = cleanText(value).toLowerCase()
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail('Укажите корректную почту')
  }
  return email
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

const TRANSLIT = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  ә: 'a',
  ғ: 'g',
  қ: 'q',
  ң: 'n',
  ө: 'o',
  ұ: 'u',
  ү: 'u',
  һ: 'h',
  і: 'i',
}

const FIO_HEADER_RE = /^(?:ф\.?\s*и\.?\s*о\.?|имя|фамилия\s+и\s+имя|фамилия\s+имя(?:\s+отчество)?|ученик|студент|тестируемый|участник|аты[\s-]*жөні|толық\s+аты[\s-]*жөні|name|full\s*name)$/i

export function loginBaseFromName(displayName) {
  const lower = cleanText(displayName).toLowerCase()
  let latin = ''
  for (const ch of lower) latin += TRANSLIT[ch] ?? ch
  const parts = latin.replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
  const selected = parts.length >= 3 && parts[0].length === 1 && parts[1].length === 1
    ? parts.slice(0, 3)
    : parts.slice(0, 2)
  const base = selected.join('.').slice(0, 26).replace(/\.+$/, '')
  if (!base) return 'user'
  if (base.length < 3) return `user.${base}`
  return base
}

export function allocateUniqueLogin(base, takenLower) {
  const root = String(base || 'user').toLowerCase()
  if (!takenLower.has(root)) {
    takenLower.add(root)
    return root
  }
  for (let n = 2; ; n += 1) {
    const suffix = String(n)
    const candidate = root.slice(0, 32 - suffix.length).replace(/\.+$/, '') + suffix
    if (!takenLower.has(candidate)) {
      takenLower.add(candidate)
      return candidate
    }
  }
}

export function parseFioLines(source) {
  const rawLines = Array.isArray(source) ? source : String(source || '').split(/\r?\n/)
  const items = []
  rawLines.forEach((raw, index) => {
    const cleaned = cleanText(String(raw ?? '').replace(/\t+/g, ' '))
    if (!cleaned) return
    const displayName = cleaned.replace(/^(?:\d+[.)]\s*|[•–—-]\s+)/, '').trim()
    if (!displayName) return
    items.push({ lineNumber: index + 1, displayName })
  })
  if (items.length > 1 && FIO_HEADER_RE.test(items[0].displayName)) items.shift()
  return items
}
