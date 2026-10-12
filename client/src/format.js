import { getLang } from './i18n.jsx'

// Меньше этого числа отвеченных вопросов доля верных считается ненадёжной.
export const MIN_SAMPLE = 30
// Для одного человека порог ниже: у теста урока обычно 5–10 вопросов.
export const MIN_PERSON_SAMPLE = 10

function locale() {
  return getLang() === 'kk' ? 'kk-KZ' : 'ru-RU'
}

export function formatNumber(value) {
  if (value == null || value === '') return '—'
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(number)
}

export function formatPercent(rate) {
  if (rate == null || !Number.isFinite(Number(rate))) return '—'
  return `${Math.round(Number(rate))} %`
}

export function formatDate(value, withTime = false) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const options = withTime
    ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' }
  return new Intl.DateTimeFormat(locale(), options).format(date)
}

export function rateOf(correct, answered) {
  if (!answered) return null
  return Math.round((Number(correct) / Number(answered)) * 100)
}

// Уровень надёжности и тон окраски для доли верных ответов.
export function rateTone(rate, answered, min = MIN_SAMPLE) {
  if (rate == null || !answered) return 'none'
  if (answered < min) return 'thin'
  if (rate >= 75) return 'high'
  if (rate >= 50) return 'mid'
  return 'low'
}

export function sumBy(items, pickValue) {
  let total = 0
  for (const item of items || []) total += Number(pickValue(item)) || 0
  return total
}
