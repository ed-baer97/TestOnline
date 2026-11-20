import crypto from 'node:crypto'
import { deleteLiveRoom, listLiveRooms, readLiveRoom, saveLiveRoom } from '../../repositories/liveRooms.js'
import { onRoomPersist } from './events.js'
import { armTimer, clearTimer, closeQuestion } from './game.js'

const PUBLIC_AUDIENCE = {
  kind: 'public',
  organizationId: null,
  classId: null,
  band: null,
  organizationName: '',
  organizationNameKk: '',
  classLabel: '',
}

const rooms = new Map()
const ROOM_TTL_MS = 4 * 60 * 60 * 1000
const PODIUM_TTL_MS = 30 * 60 * 1000
const REMEMBER_MS = 1500

const rememberTimers = new Map()
const saveTails = new Map()
const opening = new Map()

onRoomPersist((room) => {
  void remember(room)
})

export async function createRoom(quiz, audience = null) {
  let code
  do {
    code = String(crypto.randomInt(100000, 1000000))
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
    audience: audience?.kind === 'private' ? audience : { ...PUBLIC_AUDIENCE },
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
    audience: room.audience || { ...PUBLIC_AUDIENCE },
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
  const players = new Map((data.players || []).map((player) => [player.id, { ...player, socketId: null }]))
  const byToken = new Map()
  for (const player of players.values()) {
    if (player.token) byToken.set(player.token, player.id)
  }
  return {
    ...data,
    audience: data.audience?.kind === 'private' ? data.audience : { ...PUBLIC_AUDIENCE },
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
  const updatedAt = new Date().toISOString()
  const prev = saveTails.get(code) || Promise.resolve()
  const next = prev
    .then(() => saveLiveRoom(code, payload, updatedAt))
    .catch((error) => {
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
    if (live) void enqueueSave(live)
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
  const tail = saveTails.get(code) || Promise.resolve()
  saveTails.delete(code)
  opening.delete(code)
  void tail.then(() => deleteLiveRoom(code)).catch((error) => {
    console.error('Не удалось удалить комнату', error)
  })
}

export function evictRoom(code) {
  const key = String(code || '')
  const room = rooms.get(key)
  if (room) clearTimer(room)
  dropTimer(rememberTimers, key)
  rooms.delete(key)
  opening.delete(key)
}

export async function flushRooms() {
  for (const room of rooms.values()) clearTimer(room)
  // remember снимает отложенную запись и сразу кладёт текущее состояние в очередь,
  // иначе ответ последних 1,5 секунд не попадает в Postgres при остановке.
  const live = [...rooms.values()]
  await Promise.all(live.map((room) => remember(room)))
  await Promise.allSettled([...saveTails.values()])
  saveTails.clear()
  rooms.clear()
  opening.clear()
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

async function settleQuestion(room) {
  if (room.status === 'question' && room.endsAt && Date.now() >= room.endsAt) {
    if (closeQuestion(room)) await remember(room)
  } else if (room.status === 'question' && room.endsAt && !room.timer) {
    armTimer(room)
  }
}

async function loadRoom(key) {
  const cached = rooms.get(key)
  if (cached) return fresh(cached)
  const payload = await readLiveRoom(key)
  const winner = rooms.get(key)
  if (winner) return fresh(winner)
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
  return room
}

export async function openRoom(code) {
  const key = String(code || '')
  const cached = rooms.get(key)
  if (cached) {
    const active = fresh(cached)
    if (!active) return null
    await settleQuestion(active)
    return active
  }
  if (!opening.has(key)) {
    const task = loadRoom(key).finally(() => opening.delete(key))
    opening.set(key, task)
  }
  const room = await opening.get(key)
  if (!room) return null
  await settleQuestion(room)
  return room
}

export function getRoom(code) {
  return rooms.get(String(code || '')) || null
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

setInterval(() => {
  const now = Date.now()
  for (const [code, room] of rooms) {
    if (expired(room, now)) {
      clearTimer(room)
      rooms.delete(code)
      forgetRoom(code)
    }
  }
}, 60 * 1000).unref?.()
