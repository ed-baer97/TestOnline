import crypto from 'node:crypto'
import { cleanName, scorePoints } from '../../domain/quiz.js'
import { saveResult } from '../stats.js'
import { publishRoom } from './events.js'
import { leaderboard } from './views.js'

export function clearTimer(room) {
  if (room.timer) {
    clearTimeout(room.timer)
    room.timer = null
  }
}

export function playerByToken(room, token) {
  return findByToken(room, token)
}

function findByToken(room, token) {
  if (!token) return null
  for (const player of room.players.values()) {
    if (player.token === token) return player
  }
  return null
}

export function joinPlayer(room, { name, playerToken }) {
  const existing = findByToken(room, playerToken)
  if (existing) return { player: existing }

  if (room.status !== 'lobby') return { error: 'Игра уже началась' }
  if (typeof playerToken !== 'string' || !/^[A-Za-z0-9-]{20,80}$/.test(playerToken)) {
    return { error: 'Не удалось войти в комнату' }
  }
  const nickname = cleanName(name)
  if (!nickname) return { error: 'Имя от 2 до 20 символов' }
  const taken = [...room.players.values()].some((player) => player.name.toLowerCase() === nickname.toLowerCase())
  if (taken) return { error: 'Такое имя уже занято' }
  if (room.players.size >= 300) return { error: 'Комната заполнена' }

  const player = {
    id: crypto.randomUUID(),
    token: playerToken,
    name: nickname,
    score: 0,
    answered: false,
    answerIndex: null,
    lastPoints: 0,
    lastCorrect: null,
    answers: [],
    online: false,
    socketId: null,
    joinedAt: Date.now(),
  }
  room.players.set(player.id, player)
  return { player }
}

export function armTimer(room) {
  clearTimer(room)
  const delay = Math.max(0, room.endsAt - Date.now())
  room.timer = setTimeout(() => {
    room.timer = null
    if (!closeQuestion(room)) return
    publishRoom(room)
  }, delay)
  room.timer.unref?.()
}

function openNext(room) {
  const next = room.questionIndex + 1
  if (next >= room.quiz.questions.length) {
    finish(room)
    return
  }
  if (room.questionIndex < 0) room.startedAt = Date.now()
  const question = room.quiz.questions[next]
  room.questionIndex = next
  room.status = 'question'
  room.questionStartedAt = Date.now()
  room.endsAt = room.questionStartedAt + question.timeLimit * 1000
  for (const player of room.players.values()) {
    player.answered = false
    player.answerIndex = null
    player.lastPoints = 0
    player.lastCorrect = null
  }
  armTimer(room)
}

function rememberAnswer(room, player) {
  const question = room.quiz.questions[room.questionIndex]
  if (!question) return
  const chosen = player.answerIndex == null ? null : question.options[player.answerIndex]?.text ?? null
  player.answers.push({
    questionId: question.id,
    question: question.text,
    chosen,
    correct: question.options[question.correctIndex]?.text ?? '',
    ok: Boolean(player.lastCorrect),
    points: player.lastPoints || 0,
  })
}

function finish(room) {
  clearTimer(room)
  if (room.status === 'podium') return
  room.status = 'podium'
  room.endsAt = null
  room.podiumAt = Date.now()
  if (room.saved) return
  room.saved = true
  void saveResult({
    userId: room.quiz.userId,
    quizId: room.quiz.id,
    quizTitle: room.quiz.title,
    code: room.code,
    startedAt: room.startedAt || room.createdAt,
    players: leaderboard(room).map((entry) => ({
      name: entry.name,
      score: entry.score,
      rank: entry.rank,
      answers: room.players.get(entry.id)?.answers || [],
    })),
  }).catch((error) => {
    room.saved = false
    console.error('Не удалось сохранить итог игры', error)
  })
}

export function closeQuestion(room) {
  if (room.status !== 'question') return false
  clearTimer(room)
  room.status = 'reveal'
  room.endsAt = null
  for (const player of room.players.values()) {
    if (!player.answered) {
      player.lastPoints = 0
      player.lastCorrect = false
      player.answerIndex = null
      rememberAnswer(room, player)
    }
  }
  return true
}

export function advance(room) {
  if (room.status === 'question') return closeQuestion(room)
  if (room.status === 'lobby' || room.status === 'reveal') {
    openNext(room)
    return true
  }
  return false
}

export function submitAnswer(room, playerId, optionIndex) {
  if (room.status !== 'question') return { error: 'Сейчас нельзя отвечать' }
  const player = room.players.get(playerId)
  if (!player) return { error: 'Вы не в комнате' }
  if (player.answered) return { error: 'Ответ уже принят' }
  const question = room.quiz.questions[room.questionIndex]
  const index = typeof optionIndex === 'string' && /^\d+$/.test(optionIndex) ? Number(optionIndex) : optionIndex
  if (!Number.isInteger(index) || index < 0 || index >= question.options.length) {
    return { error: 'Нет такого варианта' }
  }
  const elapsed = Date.now() - room.questionStartedAt
  if (elapsed > question.timeLimit * 1000 + 750) return { error: 'Время вышло' }
  const correct = index === question.correctIndex
  const points = correct ? scorePoints(elapsed, question.timeLimit) : 0
  player.answered = true
  player.answerIndex = index
  player.lastCorrect = correct
  player.lastPoints = points
  player.score += points
  rememberAnswer(room, player)
  return { ok: true, points }
}

export function markOffline(room, playerId, socketId) {
  const player = room.players.get(playerId)
  if (!player || player.socketId !== socketId) return false
  player.online = false
  player.socketId = null
  return true
}
