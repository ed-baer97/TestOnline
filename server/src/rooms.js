import crypto from 'node:crypto'
import { cleanName, scorePoints } from './domain.js'
import { deleteLiveRoom, listLiveRooms, readLiveRoom, saveLiveRoom, saveResult } from './db.js'

const rooms = new Map()
const ROOM_TTL_MS = 4 * 60 * 60 * 1000
const PODIUM_TTL_MS = 30 * 60 * 1000
const REMEMBER_MS = 1500
const CROWD_MS = 250
const rememberTimers = new Map()
const saveTails = new Map()
const lobbyTimers = new Map()
const hostTimers = new Map()
const opening = new Map()

const PUBLIC_AUDIENCE = {
  kind: 'public',
  organizationId: null,
  classId: null,
  band: null,
  organizationName: '',
  organizationNameKk: '',
  classLabel: '',
}

export async function createRoom(quiz, audience = null) {
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
    byToken: new Map(),
    createdAt: Date.now(),
    podiumAt: null,
    audience: audience?.kind === 'private' ? audience : { ...PUBLIC_AUDIENCE },
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
    audience: room.audience || { ...PUBLIC_AUDIENCE },
  }
}

function thaw(data) {
  const players = new Map((data.players || []).map((player) => [player.id, { ...player, socketId: null }]))
  const byToken = new Map()
  for (const player of players.values()) {
    if (player.token) byToken.set(player.token, player.id)
  }
  return {
    ...data,
    timer: null,
    players,
    byToken,
  }
}

function dropTimer(map, code) {
  const timer = map.get(code)
  if (!timer) return
  clearTimeout(timer)
  map.delete(code)
}

function enqueueSave(room) {
  const code = room.code
  const payload = JSON.stringify(freeze(room))
  const prev = saveTails.get(code) || Promise.resolve()
  const next = prev.then(() => saveLiveRoom(code, payload)).catch((error) => {
    console.error('Не удалось сохранить комнату', error)
  })
  saveTails.set(code, next)
  return next
}

export function scheduleRemember(room) {
  if (rememberTimers.has(room.code)) return
  const timer = setTimeout(() => {
    rememberTimers.delete(room.code)
    const live = rooms.get(room.code)
    if (live) enqueueSave(live)
  }, REMEMBER_MS)
  timer.unref?.()
  rememberTimers.set(room.code, timer)
}

export async function remember(room) {
  dropTimer(rememberTimers, room.code)
  await enqueueSave(room)
}

function forgetRoom(code) {
  dropTimer(rememberTimers, code)
  dropTimer(lobbyTimers, code)
  dropTimer(hostTimers, code)
  const tail = saveTails.get(code) || Promise.resolve()
  saveTails.delete(code)
  opening.delete(code)
  void tail.then(() => deleteLiveRoom(code)).catch((error) => {
    console.error('Не удалось удалить комнату', error)
  })
}

function expired(room, now = Date.now()) {
  const finished = room.status === 'podium' && room.podiumAt && now - room.podiumAt > PODIUM_TTL_MS
  return finished || now - room.createdAt > ROOM_TTL_MS
}

function fresh(room) {
  if (!expired(room)) return room
  clearTimer(room)
  rooms.delete(room.code)
  forgetRoom(room.code)
  return null
}

async function loadRoom(key) {
  const again = rooms.get(key)
  if (again) return fresh(again)
  const payload = await readLiveRoom(key)
  const won = rooms.get(key)
  if (won) return fresh(won)
  if (!payload) return null
  let data
  try {
    data = JSON.parse(payload)
  } catch {
    return null
  }
  const room = thaw(data)
  if (expired(room)) {
    await deleteLiveRoom(key)
    return null
  }
  rooms.set(key, room)
  if (room.status === 'question' && room.endsAt) {
    if (Date.now() >= room.endsAt) {
      if (closeQuestion(room)) void remember(room)
    } else {
      armTimer(room)
    }
  }
  return room
}

export async function openRoom(code) {
  const key = String(code || '')
  const live = rooms.get(key)
  if (live) return fresh(live)
  const pending = opening.get(key)
  if (pending) return pending
  const job = loadRoom(key).finally(() => {
    if (opening.get(key) === job) opening.delete(key)
  })
  opening.set(key, job)
  return job
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
    access: room.audience?.kind === 'private' ? 'private' : 'public',
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

export function viewFor(room, socket, board = leaderboard(room)) {
  const question = room.questionIndex >= 0 ? room.quiz.questions[room.questionIndex] : null
  const reveal = room.status === 'reveal'
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
      access: room.audience?.kind === 'private' ? 'private' : 'public',
      organizationName: room.audience?.organizationName || '',
      organizationNameKk: room.audience?.organizationNameKk || '',
      classLabel: room.audience?.classLabel || '',
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

export async function listPrivateForClass(classId) {
  if (!classId) return []
  const rows = await listLiveRooms()
  const found = []
  for (const row of rows) {
    let data
    try {
      data = JSON.parse(row.payload)
    } catch {
      continue
    }
    if (data.audience?.kind !== 'private' || data.audience.classId !== classId) continue
    if (data.status === 'podium') continue
    const room = await openRoom(data.code)
    if (!room || room.audience?.classId !== classId || room.status === 'podium') continue
    found.push({
      code: room.code,
      title: room.quiz.title,
      status: room.status,
      playerCount: room.players.size,
    })
  }
  return found
}

const watchers = new Set()

export function watch(socket) {
  watchers.add(socket)
  socket.on('disconnect', () => watchers.delete(socket))
}

function socketsIn(room) {
  const found = []
  for (const socket of watchers) {
    if (socket.data?.code === room.code) found.push(socket)
  }
  return found
}

function emitView(room, socket, board) {
  socket.emit('sync', viewFor(room, socket, board))
}

export function push(_io, room) {
  dropTimer(lobbyTimers, room.code)
  dropTimer(hostTimers, room.code)
  const board = leaderboard(room)
  for (const socket of socketsIn(room)) emitView(room, socket, board)
}

export function pushOne(socket, room) {
  if (!socket || socket.data?.code !== room.code) return
  emitView(room, socket, leaderboard(room))
}

export function noteCrowd(room) {
  scheduleRemember(room)
  if (room.status === 'lobby') {
    if (lobbyTimers.has(room.code)) return
    const timer = setTimeout(() => {
      lobbyTimers.delete(room.code)
      const live = rooms.get(room.code)
      if (!live || live.status !== 'lobby') return
      const board = leaderboard(live)
      for (const socket of socketsIn(live)) emitView(live, socket, board)
    }, CROWD_MS)
    timer.unref?.()
    lobbyTimers.set(room.code, timer)
    return
  }
  if (hostTimers.has(room.code)) return
  const timer = setTimeout(() => {
    hostTimers.delete(room.code)
    const live = rooms.get(room.code)
    if (!live || live.status === 'lobby' || live.status === 'podium') return
    const board = leaderboard(live)
    for (const socket of socketsIn(live)) {
      if (socket.data?.role !== 'host') continue
      emitView(live, socket, board)
    }
  }, CROWD_MS)
  timer.unref?.()
  hostTimers.set(room.code, timer)
}

export async function notePhase(room) {
  push(null, room)
  await remember(room)
}

function findByToken(room, token) {
  if (!token) return null
  const id = room.byToken?.get(token)
  if (id) {
    const player = room.players.get(id)
    if (player) return player
  }
  for (const player of room.players.values()) {
    if (player.token !== token) continue
    bindToken(room, player)
    return player
  }
  return null
}

function bindToken(room, player, previous) {
  if (!room.byToken) room.byToken = new Map()
  if (previous && previous !== player.token) room.byToken.delete(previous)
  if (player.token) room.byToken.set(player.token, player.id)
}

function seatName(value, limit) {
  const name = String(value || '').replace(/\s+/g, ' ').trim()
  if (name.length < 2 || name.length > limit) return null
  return name
}

export function joinPlayer(room, { name, playerToken, user }) {
  const existing = findByToken(room, playerToken)
  if (existing) return { player: existing }

  const closed = room.audience?.kind === 'private'
  if (closed) {
    if (!user || user.role !== 'learner' || user.classId !== room.audience.classId) {
      return { error: 'Этот квиз только для выбранного класса. Войдите под своим логином.' }
    }
    const seated = [...room.players.values()].find((player) => player.userId === user.id)
    if (seated) {
      const previous = seated.token
      seated.token = playerToken
      bindToken(room, seated, previous)
      return { player: seated }
    }
  }

  if (room.status !== 'lobby') return { error: 'Игра уже началась' }
  if (typeof playerToken !== 'string' || !/^[A-Za-z0-9-]{20,80}$/.test(playerToken)) {
    return { error: 'Не удалось войти в комнату' }
  }
  const nickname = closed ? seatName(user.displayName, 40) : cleanName(name)
  if (!nickname) return { error: closed ? 'В профиле нет имени' : 'Имя от 2 до 20 символов' }
  if (!closed) {
    const taken = [...room.players.values()].some((player) => player.name.toLowerCase() === nickname.toLowerCase())
    if (taken) return { error: 'Такое имя уже занято' }
  }
  if (room.players.size >= 300) return { error: 'Комната заполнена' }

  const player = {
    id: crypto.randomUUID(),
    token: playerToken,
    userId: closed ? user.id : null,
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
  bindToken(room, player)
  return { player }
}

function armTimer(room) {
  clearTimer(room)
  const delay = Math.max(0, room.endsAt - Date.now())
  room.timer = setTimeout(() => {
    room.timer = null
    if (!closeQuestion(room)) return
    void notePhase(room)
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
    access: room.audience?.kind === 'private' ? 'private' : 'public',
    organizationId: room.audience?.kind === 'private' ? room.audience.organizationId : null,
    classId: room.audience?.kind === 'private' ? room.audience.classId : null,
    band: room.audience?.kind === 'private' ? room.audience.band : null,
    startedAt: room.startedAt || room.createdAt,
    players: leaderboard(room).map((entry) => {
      const player = room.players.get(entry.id)
      return {
        name: entry.name,
        userId: player?.userId || null,
        score: entry.score,
        rank: entry.rank,
        answers: player?.answers || [],
      }
    }),
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
      forgetRoom(code)
    }
  }
}, 60 * 1000).unref?.()
