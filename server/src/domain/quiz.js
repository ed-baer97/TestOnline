import crypto from 'node:crypto'
import { fail } from './errors.js'
import { cleanText } from './text.js'

export const COLORS = ['red', 'blue', 'yellow', 'green']
export const TIME_LIMITS = [10, 20, 30, 60]

export function scorePoints(elapsedMs, timeLimitSec) {
  const total = timeLimitSec * 1000
  const elapsed = Math.min(Math.max(Number(elapsedMs) || 0, 0), total)
  return Math.round((1 - elapsed / total / 2) * 1000)
}

export function normalizeQuiz(input) {
  const title = cleanText(input?.title)
  if (title.length < 2) {
    fail('Название короче 2 символов')
  }
  if (!Array.isArray(input?.questions) || input.questions.length < 1 || input.questions.length > 50) {
    fail('Нужен хотя бы один вопрос, максимум 50')
  }

  const questions = input.questions.map((question, index) => {
    const label = `Вопрос ${index + 1}`
    const text = cleanText(question?.text)
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
      const text = cleanText(option?.text)
      if (!text) return
      if (optionIndex === Number(question?.correctIndex)) correctIndex = options.length
      options.push({ text })
    })
    if (options.length < 2 || options.length > 4) {
      fail(`${label}: от 2 до 4 вариантов`)
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
  const name = cleanText(value)
  if (name.length < 2 || name.length > 20) return null
  return name
}
