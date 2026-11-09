import crypto from 'node:crypto'

export const COLORS = ['red', 'blue', 'yellow', 'green']
export const TIME_LIMITS = [10, 20, 30, 60]

export const BANDS = [
  { id: 'grades_1_4', label: '1–4 классы', grades: [1, 2, 3, 4] },
  { id: 'grades_5_9', label: '5–9 классы', grades: [5, 6, 7, 8, 9] },
  { id: 'grades_10_11', label: '10–11 классы', grades: [10, 11] },
  { id: 'students', label: 'Студенты', grades: [] },
]

export const GROUP_KEYS = BANDS.map((band) => band.id)

export function fail(message, status = 400) {
  const error = new Error(message)
  error.status = status
  throw error
}

export function clean(value) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\u0000-\u001F]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
}

export function cleanLabel(value, min, max, label) {
  const text = clean(value)
  if (text.length < min || text.length > max) fail(`${label}: от ${min} до ${max} символов`)
  return text
}

export function optionalLabel(value, max, label) {
  const text = clean(value)
  if (!text) return ''
  if (text.length < 2 || text.length > max) fail(`${label}: от 2 до ${max} символов`)
  return text
}

export function readLang(value) {
  return value === 'kk' ? 'kk' : 'ru'
}

export function assertRole(actor, ...roles) {
  if (!actor || !roles.includes(actor.role)) fail('Недостаточно прав', 403)
}

export function readGroups(input) {
  const source = input?.groups || input || {}
  const groups = {}
  for (const key of GROUP_KEYS) groups[key] = Boolean(source[key])
  if (!GROUP_KEYS.some((key) => groups[key])) fail('Отметьте хотя бы одну группу')
  return groups
}

export function groupNumbers(groups) {
  return GROUP_KEYS.map((key) => (groups[key] ? 1 : 0))
}

export function mapGroups(row) {
  return {
    grades_1_4: Boolean(row.grades_1_4),
    grades_5_9: Boolean(row.grades_5_9),
    grades_10_11: Boolean(row.grades_10_11),
    students: Boolean(row.students),
  }
}

export function cellText(value) {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return clean(value)
  if (value instanceof Date) return clean(value.toLocaleDateString('ru-RU'))
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return clean(value.richText.map((part) => part.text || '').join(''))
    if (value.result != null) return cellText(value.result)
    if (typeof value.text === 'string') return clean(value.text)
    return ''
  }
  return ''
}

export function scorePoints(elapsedMs, timeLimitSec) {
  const total = timeLimitSec * 1000
  const elapsed = Math.min(Math.max(Number(elapsedMs) || 0, 0), total)
  return Math.round((1 - elapsed / total / 2) * 1000)
}

export function normalizeQuiz(input) {
  const title = clean(input?.title)
  if (title.length < 2 || title.length > 80) {
    fail('Название от 2 до 80 символов')
  }
  if (!Array.isArray(input?.questions) || input.questions.length < 1 || input.questions.length > 50) {
    fail('Нужен хотя бы один вопрос, максимум 50')
  }

  const questions = input.questions.map((question, index) => {
    const label = `Вопрос ${index + 1}`
    const text = clean(question?.text)
    if (text.length < 2 || text.length > 200) {
      fail(`${label}: текст от 2 до 200 символов`)
    }
    const timeLimit = Number(question?.timeLimit)
    if (!TIME_LIMITS.includes(timeLimit)) {
      fail(`${label}: время 10, 20, 30 или 60 секунд`)
    }
    const options = []
    let correctIndex = -1
    const source = Array.isArray(question?.options) ? question.options : []
    source.forEach((option, optionIndex) => {
      const optionText = clean(option?.text)
      if (!optionText) return
      if (optionIndex === Number(question?.correctIndex)) correctIndex = options.length
      options.push({ text: optionText })
    })
    if (options.length < 2 || options.length > 4) {
      fail(`${label}: от 2 до 4 вариантов`)
    }
    if (options.some((option) => option.text.length > 400)) {
      fail(`${label}: вариант длиннее 400 символов`)
    }
    if (correctIndex < 0) {
      fail(`${label}: отметьте правильный ответ`)
    }
    return {
      id: typeof question?.id === 'string' && question.id.length > 0 ? question.id : crypto.randomUUID(),
      text,
      timeLimit,
      options,
      correctIndex,
    }
  })

  return { title, questions }
}

export function cleanName(value) {
  const name = clean(value)
  if (name.length < 2 || name.length > 20) return null
  return name
}

export function normalizeAccount({ login, password }) {
  const name = clean(login)
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._-]{2,31}$/u.test(name)) {
    fail('Логин: 3–32 символа, буквы, цифры, точка, _ или -')
  }
  const pass = String(password ?? '')
  if (pass.length < 6 || pass.length > 72) {
    fail('Пароль от 6 до 72 символов')
  }
  return { login: name, password: pass }
}
