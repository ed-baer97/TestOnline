import crypto from 'node:crypto'
import { fail } from '../domain/errors.js'
import { isUniqueViolation } from '../infrastructure/db/index.js'
import { hashPassword, verifyPassword } from '../infrastructure/passwords.js'
import * as quizzesRepo from '../repositories/quizzes.js'
import * as resultsRepo from '../repositories/results.js'
import * as usersRepo from '../repositories/users.js'
import { addDemoQuiz } from './quizzes.js'

// Ведущих заводят из кода (тесты, старые базы): HTTP-маршрута регистрации нет.
// Первый ведущий забирает квизы и итоги, которые лежали в базе без владельца.
export async function registerUser({ login, password }) {
  const first = (await usersRepo.countUsers()) === 0
  const id = crypto.randomUUID()
  const passwordHash = await hashPassword(password)
  try {
    await usersRepo.insertHost({ id, login, passwordHash, createdAt: new Date().toISOString() })
  } catch (error) {
    if (isUniqueViolation(error)) fail('Такой логин уже занят', 409)
    throw error
  }
  if (first) {
    await quizzesRepo.claimOrphanQuizzes(id)
    await resultsRepo.claimOrphanResults(id)
  }
  if ((await quizzesRepo.countQuizzes(id)) === 0) await addDemoQuiz(id)
  return { id, login }
}

export async function authenticate(login, password) {
  const row = await usersRepo.findCredentials(String(login || '').trim())
  if (!row || !(await verifyPassword(password, row.password_hash))) return null
  return { id: row.id, login: row.login, role: row.role || 'host' }
}
