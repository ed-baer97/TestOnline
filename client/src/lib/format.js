export const MIN_SAMPLE = 30
export const MIN_PERSON_SAMPLE = 10

function locale(lang = 'ru') {
  return lang === 'kk' ? 'kk-KZ' : 'ru-RU'
}

export function formatCode(code) {
  return String(code).replace(/(\d{3})(\d{3})/, '$1 $2')
}

export function formatNumber(value, lang = 'ru') {
  if (value == null || value === '') return '—'
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 1 }).format(number)
}

export function formatPercent(rate) {
  if (rate == null || !Number.isFinite(Number(rate))) return '—'
  return `${Math.round(Number(rate))} %`
}

export function formatDate(value, withTime = false, lang = 'ru') {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const options = withTime
    ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' }
  return new Intl.DateTimeFormat(locale(lang), options).format(date)
}

export function formatWhen(value, lang = 'ru') {
  return formatDate(value, true, lang)
}

export function shortWhen(value, lang = 'ru') {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'short' }).format(date)
}

export function rateOf(correct, answered) {
  if (!answered) return null
  return Math.round((Number(correct) / Number(answered)) * 100)
}

export function rateTone(rate, answered, min = MIN_SAMPLE) {
  if (rate == null || !answered) return 'none'
  if (answered < min) return 'thin'
  if (rate >= 75) return 'high'
  if (rate >= 50) return 'mid'
  return 'low'
}
