import crypto from 'node:crypto'
import { fail } from './errors.js'
import { pickGroups } from './structure.js'
import { cleanLabel, cleanText } from './text.js'

export const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg'])
export const MAX_VIDEO = 80 * 1024 * 1024
export const MAX_IMAGE = 1_500_000
export const TONES = ['sun', 'orbit', 'planets', 'earth']

// У урока группы приходят только в поле groups.
export function readLessonGroups(input) {
  return pickGroups(input?.groups || {})
}

export function lessonFormat(row) {
  return row.format === 'video' ? 'video' : 'slides'
}

export function readFormat(input) {
  if (input?.format == null || input.format === 'slides') return 'slides'
  if (input.format === 'video') return 'video'
  fail('Неизвестный вид урока')
}

export function normalizeFrame(slide) {
  const title = cleanLabel(slide?.title, 2, 80, 'Заголовок слайда')
  const kicker = cleanText(slide?.kicker)
  if (kicker.length > 40) fail('Подпись слайда длиннее 40 символов')
  const source = Array.isArray(slide?.lines) ? slide.lines : []
  const lines = source.map((line) => cleanText(line)).filter(Boolean)
  if (lines.length < 1 || lines.length > 6) fail('На слайде от 1 до 6 строк')
  if (lines.some((line) => line.length > 160)) fail('Строка слайда длиннее 160 символов')
  const tone = TONES.includes(slide?.tone) ? slide.tone : 'orbit'
  const id = typeof slide?.id === 'string' && slide.id ? slide.id : crypto.randomUUID()
  return { id, kind: 'frame', tone, kicker, title, lines }
}

export function readDataUrl(value) {
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(value || ''))
  if (!match) fail('Слайд: нужна картинка PNG, JPEG или WebP')
  const mime = match[1] === 'jpg' ? 'image/jpeg' : `image/${match[1]}`
  let bytes
  try {
    bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64')
  } catch {
    fail('Слайд: картинка повреждена')
  }
  if (!bytes.length) fail('Слайд: картинка повреждена')
  if (bytes.length > MAX_IMAGE) fail('Картинка слайда больше 1,5 МБ после сжатия')
  return { mime, bytes }
}

export function normalizeQuestions(questions) {
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 20) {
    fail('Нужен хотя бы один вопрос, максимум 20')
  }
  return questions.map((question, index) => {
    const label = `Вопрос ${index + 1}`
    const text = cleanText(question?.text)
    if (text.length < 2 || text.length > 500) fail(`${label}: текст от 2 до 500 символов`)
    const options = []
    let correctIndex = -1
    const source = Array.isArray(question?.options) ? question.options : []
    source.forEach((option, optionIndex) => {
      const optionText = cleanText(option?.text)
      if (!optionText) return
      if (optionIndex === Number(question?.correctIndex)) correctIndex = options.length
      options.push({ text: optionText })
    })
    if (options.length < 2 || options.length > 4) fail(`${label}: от 2 до 4 вариантов`)
    if (options.some((option) => option.text.length > 400)) fail(`${label}: вариант длиннее 400 символов`)
    if (correctIndex < 0) fail(`${label}: отметьте правильный ответ`)
    return {
      id: typeof question?.id === 'string' && question.id ? question.id : crypto.randomUUID(),
      text,
      options,
      correctIndex,
    }
  })
}

export function presentQuestions(questions, withKey) {
  return questions.map((question) => {
    const item = {
      id: question.id,
      text: question.text,
      options: question.options.map((option) => ({ text: option.text })),
    }
    if (withKey) item.correctIndex = question.correctIndex
    return item
  })
}

export function readAnswers(answers) {
  const given = new Map()
  for (const item of Array.isArray(answers) ? answers : []) {
    if (typeof item?.questionId !== 'string') continue
    const chosen = Number(item?.optionIndex ?? item?.chosen)
    given.set(item.questionId, Number.isInteger(chosen) && chosen >= 0 ? chosen : -1)
  }
  return given
}

export function gradeAnswers(questions, given) {
  const results = questions.map((question) => {
    const chosen = given.has(question.id) ? given.get(question.id) : -1
    return {
      questionId: question.id,
      chosen,
      correctIndex: question.correctIndex,
      ok: chosen === question.correctIndex,
    }
  })
  return { score: results.filter((item) => item.ok).length, total: questions.length, results }
}

export function attemptState(rows, max) {
  return { used: rows.length, max, locked: rows.length >= max }
}
