import crypto from 'node:crypto'
import { deleteLiveRoom, readLiveRoom, saveLiveRoom } from '../../repositories/liveRooms.js'
import { armTimer, clearTimer, closeQuestion } from './game.js'

const rooms = new Map()
const ROOM_TTL_MS = 4 * 60 * 60 * 1000
const PODIUM_TTL_MS = 30 * 60 * 1000

export async function createRoom(quiz) {
  let code
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
  if (previous && previous !== room) {
    clearTimer(previous)
    // Сокеты живут в памяти процесса, а отключение не пишет снимок: связь с игроком берётся из прежнего объекта.
    for (const player of room.players.values()) {
      const before = previous.players.get(player.id)
      if (!before) continue
      player.socketId = before.socketId
      player.online = before.online
    }
  }
  rooms.set(key, room)
  if (room.status === 'question' && room.endsAt && Date.now() >= room.endsAt) {
    closeQuestion(room)
    await remember(room)
  } else if (room.status === 'question' && room.endsAt && !room.timer) {
    armTimer(room)
  }
  return room
}

export function getRoom(code) {
  return rooms.get(String(code || '')) || null
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
