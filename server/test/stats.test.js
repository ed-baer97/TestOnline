import assert from 'node:assert/strict'
import test from 'node:test'
import { useTestDatabase } from './helpers/db.js'

await useTestDatabase('stats')
process.env.SESSION_SECRET = 'test-secret'

test('сводка считает запуски, средний балл и долю верных ответов', async () => {
  const { registerUser } = await import('../src/services/accounts.js')
  const { createQuiz } = await import('../src/services/quizzes.js')
  const { quizStats, saveResult, statsOverview } = await import('../src/services/stats.js')
  const user = await registerUser({ login: 'stat', password: 'secret1' })
  const quiz = await createQuiz(user.id, {
    title: 'География',
    questions: [{
      id: 'q1',
      text: 'Столица Франции?',
      timeLimit: 20,
      correctIndex: 0,
      options: [{ text: 'Париж' }, { text: 'Рим' }],
    }],
  })
  await saveResult({
    userId: user.id,
    quizId: quiz.id,
    quizTitle: quiz.title,
    code: '111111',
    startedAt: '2026-10-09T08:30:00.000Z',
    players: [
      {
        name: 'Аня',
        score: 1000,
        rank: 1,
        answers: [{ questionId: 'q1', question: 'Столица Франции?', chosen: 'Париж', correct: 'Париж', ok: true, points: 1000 }],
      },
      {
        name: 'Боря',
        score: 0,
        rank: 2,
        answers: [{ questionId: 'q1', question: 'Столица Франции?', chosen: 'Рим', correct: 'Париж', ok: false, points: 0 }],
      },
    ],
  })

  const overview = await statsOverview(user.id)
  assert.equal(overview.runs, 1)
  assert.equal(overview.participants, 2)
  assert.equal(overview.averageScore, 500)
  assert.equal(overview.byQuiz[0].runs, 1)
  assert.equal(overview.history.length, 1)
  assert.equal(overview.history[0].title, 'География')

  const detail = await quizStats(user.id, quiz.id)
  assert.equal(detail.questions[0].rate, 50)
  assert.equal(detail.questions[0].correct, 1)
  assert.equal(detail.sessions[0].players[1].answers[0].chosen, 'Рим')
  assert.equal(detail.sessions[0].playerCount, 2)
  assert.equal(detail.sessions[0].startedAt, '2026-10-09T08:30:00.000Z')
  assert.equal(await quizStats(user.id, 'missing'), null)
})
