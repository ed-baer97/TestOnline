import crypto from 'node:crypto'

export const COLORS = ['red', 'blue', 'yellow', 'green']
export const TIME_LIMITS = [10, 20, 30, 60]

export function scorePoints(elapsedMs, timeLimitSec) {
  const total = timeLimitSec * 1000
  const elapsed = Math.min(Math.max(Number(elapsedMs) || 0, 0), total)
  return Math.round((1 - elapsed / total / 2) * 1000)
}

function cleanText(value) {
  return String(value || '').replace(/[\u0000-\u001F]/g, '').trim().replace(/\s+/g, ' ')
}

function reject(message) {
  const error = new Error(message)
  error.status = 400
  throw error
}

export function normalizeQuiz(input) {
  const title = cleanText(input?.title)
  if (title.length < 2 || title.length > 80) {
    reject('Название от 2 до 80 символов')
  }
  if (!Array.isArray(input?.questions) || input.questions.length < 1 || input.questions.length > 50) {
    reject('Нужен хотя бы один вопрос, максимум 50')
  }

  const questions = input.questions.map((question, index) => {
    const label = `Вопрос ${index + 1}`
    const text = cleanText(question?.text)
    if (text.length < 2 || text.length > 200) {
      reject(`${label}: текст от 2 до 200 символов`)
    }
    const timeLimit = Number(question?.timeLimit)
    if (!TIME_LIMITS.includes(timeLimit)) {
      reject(`${label}: время 10, 20, 30 или 60 секунд`)
    }
    const options = []
    let correctIndex = -1
    const source = Array.isArray(question?.options) ? question.options : []
    source.forEach((option, optionIndex) => {
      const text = cleanText(option?.text)
      if (!text) return
      if (optionIndex === Number(question?.correctIndex)) correctIndex = options.length
      options.push({ text })
    })
    if (options.length < 2 || options.length > 4) {
      reject(`${label}: от 2 до 4 вариантов`)
    }
    if (options.some((option) => option.text.length > 400)) {
      reject(`${label}: вариант длиннее 400 символов`)
    }
    if (correctIndex < 0) {
      reject(`${label}: отметьте правильный ответ`)
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
  const name = cleanText(value)
  if (name.length < 2 || name.length > 20) return null
  return name
}

export function normalizeAccount({ login, password }) {
  const name = cleanText(login)
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._-]{2,31}$/u.test(name)) {
    reject('Логин: 3–32 символа, буквы, цифры, точка, _ или -')
  }
  const pass = String(password ?? '')
  if (pass.length < 6 || pass.length > 72) {
    reject('Пароль от 6 до 72 символов')
  }
  return { login: name, password: pass }
}
