import crypto from 'node:crypto'
import * as resultsRepo from '../repositories/results.js'
import { getQuiz, listQuizzes } from './quizzes.js'

export async function saveResult({ userId, quizId, quizTitle, code, players, startedAt }) {
  await resultsRepo.insertResult({
    id: crypto.randomUUID(),
    userId,
    quizId,
    quizTitle,
    code,
    players,
    startedAt: startedAt ? new Date(startedAt).toISOString() : null,
    finishedAt: new Date().toISOString(),
  })
}

export async function listResults(userId) {
  return resultsRepo.listRecentResults(userId)
}

function averageScore(players) {
  if (!players.length) return null
  const total = players.reduce((sum, player) => sum + (Number(player.score) || 0), 0)
  return Math.round(total / players.length)
}

function summarizeResult(result) {
  return {
    id: result.id,
    quizId: result.quizId,
    title: result.title,
    code: result.code,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    playerCount: result.players.length,
    averageScore: averageScore(result.players),
    top: result.players[0] ? { name: result.players[0].name, score: result.players[0].score } : null,
  }
}

export async function statsOverview(userId) {
  const quizzes = await listQuizzes(userId)
  const results = await resultsRepo.listResults(userId)
  const scores = results.flatMap((result) => result.players.map((player) => Number(player.score) || 0))
  const byQuiz = new Map(quizzes.map((quiz) => [quiz.id, {
    quizId: quiz.id,
    title: quiz.title,
    questionCount: quiz.questionCount,
    runs: 0,
    participants: 0,
    scores: [],
  }]))
  for (const result of results) {
    const key = result.quizId || `title:${result.title}`
    if (!byQuiz.has(key)) {
      byQuiz.set(key, { quizId: result.quizId, title: result.title, questionCount: null, runs: 0, participants: 0, scores: [] })
    }
    const bucket = byQuiz.get(key)
    bucket.runs += 1
    bucket.participants += result.players.length
    bucket.scores.push(...result.players.map((player) => Number(player.score) || 0))
  }
  return {
    quizzes: quizzes.length,
    runs: results.length,
    participants: results.reduce((sum, result) => sum + result.players.length, 0),
    averageScore: averageScore(scores.map((score) => ({ score }))),
    byQuiz: [...byQuiz.values()]
      .map((bucket) => ({
        quizId: bucket.quizId,
        title: bucket.title,
        questionCount: bucket.questionCount,
        runs: bucket.runs,
        participants: bucket.participants,
        averageScore: averageScore(bucket.scores.map((score) => ({ score }))),
      }))
      .sort((a, b) => b.runs - a.runs || a.title.localeCompare(b.title, 'ru')),
    recent: results.slice(0, 8).map(summarizeResult),
    history: results.map(summarizeResult),
  }
}

export async function quizStats(userId, quizId) {
  const quiz = await getQuiz(quizId, userId)
  if (!quiz) return null
  const results = await resultsRepo.listResults(userId, quizId)
  const questions = new Map()
  const order = []
  const bucketFor = (key, text) => {
    if (!questions.has(key)) {
      questions.set(key, { text, correct: 0, total: 0 })
      order.push(key)
    }
    return questions.get(key)
  }
  for (const question of quiz.questions) bucketFor(question.id || question.text, question.text)
  for (const result of results) {
    for (const player of result.players) {
      for (const answer of player.answers || []) {
        const bucket = bucketFor(answer.questionId || answer.question, answer.question)
        bucket.total += 1
        if (answer.ok) bucket.correct += 1
      }
    }
  }
  const players = results.flatMap((result) => result.players)
  return {
    id: quiz.id,
    title: quiz.title,
    questionCount: quiz.questions.length,
    runs: results.length,
    participants: players.length,
    averageScore: averageScore(players),
    questions: order.map((key) => {
      const item = questions.get(key)
      return {
        text: item.text,
        correct: item.correct,
        total: item.total,
        rate: item.total ? Math.round((item.correct / item.total) * 100) : null,
      }
    }),
    sessions: results.map((result) => ({
      id: result.id,
      code: result.code,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      playerCount: result.players.length,
      averageScore: averageScore(result.players),
      topScore: result.players[0]?.score ?? null,
      players: result.players.map((player) => ({
        name: player.name,
        score: player.score,
        rank: player.rank,
        answers: Array.isArray(player.answers) ? player.answers : null,
      })),
    })),
  }
}
