import { fail } from './errors.js'

export function cleanText(value) {
  return String(value || '').replace(/[\u0000-\u001F]/g, '').trim().replace(/\s+/g, ' ')
}

export function cleanLabel(value, min, max, label) {
  const text = cleanText(value)
  if (text.length < min || text.length > max) fail(`${label}: от ${min} до ${max} символов`)
  return text
}

export function sameText(left, right) {
  return left.localeCompare(right, 'ru', { sensitivity: 'accent' }) === 0
}

export function optionalLabel(value, max, label) {
  const text = cleanText(value)
  if (!text) return ''
  if (text.length < 2 || text.length > max) fail(`${label}: от 2 до ${max} символов`)
  return text
}
