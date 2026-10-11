import crypto from 'node:crypto'
import { assertRole } from '../../domain/access.js'
import { fail } from '../../domain/errors.js'
import { attemptState, gradeAnswers, readAnswers } from '../../domain/lesson.js'
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
  return { score: Number(row.score), total: Number(row.total), finishedAt: row.finished_at, results }
}

export async function checkLesson(actor, id, answers) {
  assertRole(actor, 'super', 'learner')
  const row = await mustLesson(id)
  if (!(await canSee(actor, row))) fail('Урок не найден', 404)
  const questions = JSON.parse(row.questions)
  const given = readAnswers(answers)
  const graded = gradeAnswers(questions, given)
  if (actor.role !== 'learner') return { ...graded, repeated: false, attempts: null }

  const max = attemptLimit()
  const before = await attemptsOf(id, actor.id)
  if (before.length >= max) {
    // Попытки исчерпаны: повторная отправка возвращает сохранённый результат, новая строка не пишется.
    return { ...presentAttempt(before[before.length - 1], questions), repeated: true, attempts: attemptState(before, max) }
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
  })

  // Две одновременные отправки могли пройти проверку выше: оставляем первые max попыток, лишние убираем.
  const after = await attemptsOf(id, actor.id)
  if (after.length > max) {
    for (const extra of after.slice(max)) await lessonAttemptsRepo.deleteAttempt(extra.id)
    const kept = after.slice(0, max)
    const last = kept[kept.length - 1]
    return { ...presentAttempt(last, questions), repeated: last.id !== attemptId, attempts: attemptState(kept, max) }
  }
  return { ...graded, repeated: false, attempts: attemptState(after, max) }
}
