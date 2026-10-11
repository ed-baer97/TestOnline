import crypto from 'node:crypto'
import { normalizeQuiz } from '../domain/quiz.js'
import * as quizzesRepo from '../repositories/quizzes.js'

const DEMO = [
  {
    text: 'Столица Франции?',
    timeLimit: 20,
    correctIndex: 0,
    options: [{ text: 'Париж' }, { text: 'Рим' }, { text: 'Берлин' }, { text: 'Мадрид' }],
  },
  {
    text: 'Сколько планет в Солнечной системе?',
    timeLimit: 20,
    correctIndex: 0,
    options: [{ text: '8' }, { text: '9' }, { text: '7' }, { text: '10' }],
  },
  {
    text: 'Какой газ составляет большую часть воздуха?',
    timeLimit: 20,
    correctIndex: 0,
    options: [{ text: 'Азот' }, { text: 'Кислород' }, { text: 'Углекислый газ' }, { text: 'Водород' }],
  },
  {
    text: 'Сколько будет 7 × 8?',
    timeLimit: 10,
    correctIndex: 0,
    options: [{ text: '56' }, { text: '54' }, { text: '64' }, { text: '48' }],
  },
  {
    text: 'Самый большой океан Земли?',
    timeLimit: 20,
    correctIndex: 0,
    options: [{ text: 'Тихий' }, { text: 'Атлантический' }, { text: 'Индийский' }, { text: 'Северный Ледовитый' }],
  },
]

export async function addDemoQuiz(userId) {
  const now = new Date().toISOString()
  const questions = DEMO.map((question) => ({ ...question, id: crypto.randomUUID() }))
  await quizzesRepo.insertQuiz({
    id: crypto.randomUUID(),
    userId,
    title: 'Демо: общий кругозор',
    questions,
    createdAt: now,
    updatedAt: now,
  })
}

export async function listQuizzes(userId) {
  return quizzesRepo.listQuizSummaries(userId)
}

export async function getQuiz(id, userId) {
  return quizzesRepo.findQuiz(id, userId)
}

export async function createQuiz(userId, input) {
  const quiz = normalizeQuiz(input)
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  await quizzesRepo.insertQuiz({ id, userId, title: quiz.title, questions: quiz.questions, createdAt: now, updatedAt: now })
  return getQuiz(id, userId)
}

export async function updateQuiz(id, userId, input) {
  const quiz = normalizeQuiz(input)
  const now = new Date().toISOString()
  const changes = await quizzesRepo.updateQuiz(id, userId, { title: quiz.title, questions: quiz.questions, updatedAt: now })
  if (changes === 0) return null
  return getQuiz(id, userId)
}

export async function deleteQuiz(id, userId) {
  return (await quizzesRepo.deleteQuiz(id, userId)) > 0
}
