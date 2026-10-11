import crypto from 'node:crypto'
import { cleanName, scorePoints } from './domain/quiz.js'
import { deleteLiveRoom, readLiveRoom, saveLiveRoom } from './repositories/liveRooms.js'
import { saveResult } from './services/stats.js'

const rooms = new Map()
const ROOM_TTL_MS = 4 * 60 * 60 * 1000
const PODIUM_TTL_MS = 30 * 60 * 1000

export async function createRoom(quiz) {
  let code = ''
  do {
    code = String(Math.floor(100000 + Math.random() * 900000))
  } while (rooms.has(code) || await readLiveRoom(code))

  const room = {
    code,
    hostToken: crypto.randomBytes(24).toString('base64url'),
    quiz: {
      id: quiz.id,
      userId: quiz.userId,
      title: quiz.title,
      questions: quiz.questions.map((question) => ({
        id: question.id,
        text: question.text,
        timeLimit: question.timeLimit,
        correctIndex: question.correctIndex,
        options: question.options.map((option) => ({ text: option.text })),
      })),
    },
    status: 'lobby',
    questionIndex: -1,
    questionStartedAt: null,
    endsAt: null,
    timer: null,
    saved: false,
    players: new Map(),
    createdAt: Date.now(),
    podiumAt: null,
  }
  rooms.set(code, room)
  await remember(room)
  return room
}

function freeze(room) {
  return {
    code: room.code,
    hostToken: room.hostToken,
    quiz: room.quiz,
    status: room.status,
    questionIndex: room.questionIndex,
    questionStartedAt: room.questionStartedAt,
    endsAt: room.endsAt,
    saved: room.saved,
    players: [...room.players.values()].map(({ socketId, ...player }) => player),
    createdAt: room.createdAt,
    podiumAt: room.podiumAt,
    startedAt: room.startedAt || null,
  }
}

function thaw(data) {
  return {
    ...data,
    timer: null,
    players: new Map((data.players || []).map((player) => [player.id, { ...player, socketId: null }])),
  }
}

export async function remember(room) {
  await saveLiveRoom(room.code, JSON.stringify(freeze(room)), new Date().toISOString())
}

function expired(room, now = Date.now()) {
  const finished = room.status === 'podium' && room.podiumAt && now - room.podiumAt > PODIUM_TTL_MS
  return finished || now - room.createdAt > ROOM_TTL_MS
}

export async function openRoom(code) {
  const key = String(code || '')
  const payload = await readLiveRoom(key)
  const room = payload ? thaw(JSON.parse(payload)) : rooms.get(key)
  if (!room) return null
  if (expired(room)) {
    clearTimer(room)
    rooms.delete(key)
    await deleteLiveRoom(key)
    return null
  }
  const previous = rooms.get(key)
  if (previous && previous !== room) clearTimer(previous)
  rooms.set(key, room)
  if (room.status === 'question' && room.endsAt && Date.now() >= room.endsAt) {
    closeQuestion(room)
    await remember(room)
  }
  return room
}

export function getRoom(code) {
  return rooms.get(String(code || '')) || null
}

export function publicInfo(room) {
  return {
    code: room.code,
    title: room.quiz.title,
    status: room.status,
    playerCount: room.players.size,
    joinable: room.status === 'lobby',
  }
}

function clearTimer(room) {
  if (room.timer) {
    clearTimeout(room.timer)
    room.timer = null
  }
}

function leaderboard(room) {
  return [...room.players.values()]
    .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
    .map((player, index) => ({
      id: player.id,
      name: player.name,
      score: player.score,
      rank: index + 1,
      lastPoints: player.lastPoints,
      lastCorrect: player.lastCorrect,
    }))
}

function questionPayload(question, reveal) {
  const payload = {
    text: question.text,
    timeLimit: question.timeLimit,
    options: question.options.map((option, index) => ({ index, text: option.text })),
  }
  if (reveal) payload.correctIndex = question.correctIndex
  return payload
}

function optionCounts(room) {
  const question = room.quiz.questions[room.questionIndex]
  const counts = question.options.map(() => 0)
  for (const player of room.players.values()) {
    if (player.answered && player.answerIndex != null) counts[player.answerIndex] += 1
  }
  return counts
}

export function viewFor(room, socket) {
  const question = room.questionIndex >= 0 ? room.quiz.questions[room.questionIndex] : null
  const reveal = room.status === 'reveal'
  const board = leaderboard(room)
  const showQuestion = room.status === 'question' || room.status === 'reveal'
  const base = {
    code: room.code,
    title: room.quiz.title,
    status: room.status,
    questionIndex: room.questionIndex,
    questionCount: room.quiz.questions.length,
    endsAt: room.status === 'question' ? room.endsAt : null,
    serverNow: Date.now(),
    playerCount: room.players.size,
    answeredCount: [...room.players.values()].filter((player) => player.answered).length,
  }

  if (socket.data?.role === 'host') {
    return {
      ...base,
      role: 'host',
      players: [...room.players.values()]
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((player) => ({
          id: player.id,
          name: player.name,
          score: player.score,
          online: player.online,
          answered: player.answered,
        })),
      question: showQuestion && question
        ? {
            ...questionPayload(question, reveal),
            optionCounts: reveal ? optionCounts(room) : undefined,
          }
        : null,
      leaderboard: board.slice(0, 50).map(({ name, score, rank }) => ({ name, score, rank })),
    }
  }

  const player = room.players.get(socket.data?.playerId)
  const me = player ? board.find((entry) => entry.id === player.id) : null
  const top = board.slice(0, 5).map(({ name, score, rank }) => ({ name, score, rank }))
  return {
    ...base,
    role: 'player',
    me: player
      ? {
          name: player.name,
          score: player.score,
          answered: player.answered,
          answerIndex: room.status === 'question' || reveal ? player.answerIndex : null,
          lastPoints: reveal || room.status === 'podium' ? player.lastPoints : null,
          lastCorrect: reveal || room.status === 'podium' ? player.lastCorrect : null,
          rank: me?.rank ?? null,
        }
      : null,
    question: showQuestion && question ? questionPayload(question, reveal) : null,
    leaderboard: top,
  }
}

export function hostView(room) {
  return viewFor(room, { data: { role: 'host' } })
}

export function playerView(room, playerId) {
  return viewFor(room, { data: { role: 'player', playerId } })
}

export function playerByToken(room, token) {
  return findByToken(room, token)
}

const watchers = new Set()

export function watch(socket) {
  watchers.add(socket)
  socket.on('disconnect', () => watchers.delete(socket))
}

export function push(_io, room) {
  for (const socket of watchers) {
    if (socket.data?.code !== room.code) continue
    socket.emit('sync', viewFor(room, socket))
  }
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

function armTimer(room, io) {
  clearTimer(room)
  const delay = Math.max(0, room.endsAt - Date.now())
  room.timer = setTimeout(() => {
    room.timer = null
    if (!closeQuestion(room)) return
    push(io, room)
  }, delay)
}

function openNext(room, io) {
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
  armTimer(room, io)
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

export function advance(room, io) {
  if (room.status === 'question') return closeQuestion(room)
  if (room.status === 'lobby' || room.status === 'reveal') {
    openNext(room, io)
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
  const index = Number(optionIndex)
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

setInterval(() => {
  const now = Date.now()
  for (const [code, room] of rooms) {
    const finished = room.status === 'podium' && room.podiumAt && now - room.podiumAt > PODIUM_TTL_MS
    const expired = now - room.createdAt > ROOM_TTL_MS
    if (finished || expired) {
      clearTimer(room)
      rooms.delete(code)
      void deleteLiveRoom(code)
    }
  }
}, 60 * 1000).unref?.()
