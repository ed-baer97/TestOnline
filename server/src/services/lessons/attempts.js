import crypto from 'node:crypto'
import { assertRole } from '../../domain/access.js'
import { fail } from '../../domain/errors.js'
import { attemptState, gradeAnswers, packAvailable, parseLessonList, readAnswers, readLang } from '../../domain/lesson.js'
import * as lessonAttemptsRepo from '../../repositories/lessonAttempts.js'
import { attemptLimit, canSee, mustLesson } from './access.js'

export async function attemptsOf(lessonId, userId) {
  return lessonAttemptsRepo.listAttempts(lessonId, userId)
}

export function presentAttempt(row, questions) {
  if (!row) return null
  let results = null
  if (row.answers) {
    try {
      const stored = JSON.parse(row.answers)
      results = gradeAnswers(questions, readAnswers(stored)).results
    } catch {
      results = null
    }
  }
  return { score: Number(row.score), total: Number(row.total), finishedAt: row.finished_at, lang: readLang(row.lang), results }
}

export async function checkLesson(actor, id, answers, lang = 'ru') {
  assertRole(actor, 'super', 'learner')
  const row = await mustLesson(id)
  if (!(await canSee(actor, row))) fail('Урок не найден', 404)
  const chosen = readLang(lang)
  if (!packAvailable(row, chosen)) fail('Данный материал не загружен', 400)
  const questions = parseLessonList(chosen === 'kk' ? row.questions_kk : row.questions)
  const given = readAnswers(answers)
  const graded = gradeAnswers(questions, given)
  if (actor.role !== 'learner') return { ...graded, repeated: false, attempts: null }

  const max = attemptLimit()
  const before = await attemptsOf(id, actor.id)
  if (before.length >= max) {
    // Попытки исчерпаны: повторная отправка возвращает сохранённый результат, новая строка не пишется.
    const last = before[before.length - 1]
    const lastQuestions = parseLessonList(readLang(last.lang) === 'kk' ? row.questions_kk : row.questions)
    return { ...presentAttempt(last, lastQuestions), repeated: true, attempts: attemptState(before, max) }
  }

  const attemptId = crypto.randomUUID()
  await lessonAttemptsRepo.insertAttempt({
    id: attemptId,
    lessonId: id,
    userId: actor.id,
    score: graded.score,
    total: graded.total,
    finishedAt: new Date().toISOString(),
    answers: questions.map((question) => ({
      questionId: question.id,
      chosen: given.has(question.id) ? given.get(question.id) : -1,
    })),
    lang: chosen,
  })

  // Две одновременные отправки могли пройти проверку выше: оставляем первые max попыток, лишние убираем.
  const after = await attemptsOf(id, actor.id)
  if (after.length > max) {
    for (const extra of after.slice(max)) await lessonAttemptsRepo.deleteAttempt(extra.id)
    const kept = after.slice(0, max)
    const last = kept[kept.length - 1]
    const lastQuestions = parseLessonList(readLang(last.lang) === 'kk' ? row.questions_kk : row.questions)
    return { ...presentAttempt(last, lastQuestions), repeated: last.id !== attemptId, attempts: attemptState(kept, max) }
  }
  return { ...graded, repeated: false, attempts: attemptState(after, max) }
}
