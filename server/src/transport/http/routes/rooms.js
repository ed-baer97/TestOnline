import { getQuiz } from '../../../services/quizzes.js'
import {
  advance,
  createRoom,
  hostView,
  joinPlayer,
  openRoom,
  playerByToken,
  playerView,
  publicInfo,
  publishRoom,
  remember,
  submitAnswer,
} from '../../../services/rooms/index.js'
import { requireQuizAuthor, route } from '../middleware.js'
import { createRateLimiter } from '../rateLimit.js'

const ROOM_MISS_WINDOW_MS = 60 * 1000
const roomMissLimiter = createRateLimiter({ windowMs: ROOM_MISS_WINDOW_MS, max: 30 })

function limitMiss(res, ip, status, error) {
  roomMissLimiter.hit(ip)
  res.status(status).json({ error })
}

async function lookupRoom(req, res) {
  const ip = req.ip || 'unknown'
  if (roomMissLimiter.isBlocked(ip)) {
    res.status(429).json({ error: 'Слишком много запросов. Попробуйте через минуту' })
    return null
  }
  const room = await openRoom(req.params.code)
  if (!room) {
    limitMiss(res, ip, 404, 'Комната не найдена')
    return null
  }
  return room
}

// Комнатой управляют по hostToken и playerToken, а не по cookie: экран ведущего и телефоны входят без логина.
export function registerRoomRoutes(app) {
  app.post('/api/rooms', requireQuizAuthor, route(async (req, res) => {
    const quiz = await getQuiz(req.body?.quizId, req.userId)
    if (!quiz) {
      res.status(404).json({ error: 'Квиз не найден' })
      return
    }
    const room = await createRoom(quiz)
    res.status(201).json({ code: room.code, hostToken: room.hostToken, title: room.quiz.title })
  }))

  app.get('/api/rooms/:code/host', route(async (req, res) => {
    const room = await lookupRoom(req, res)
    if (!room) return
    if (room.hostToken !== req.query.token) {
      limitMiss(res, req.ip || 'unknown', 404, 'Комната не найдена')
      return
    }
    res.json(hostView(room))
  }))

  app.post('/api/rooms/:code/advance', route(async (req, res) => {
    const room = await lookupRoom(req, res)
    if (!room) return
    if (room.hostToken !== req.body?.hostToken) {
      limitMiss(res, req.ip || 'unknown', 404, 'Комната не найдена')
      return
    }
    if (!advance(room)) {
      res.status(400).json({ error: 'Сейчас это действие недоступно' })
      return
    }
    await remember(room)
    publishRoom(room)
    res.json(hostView(room))
  }))

  app.post('/api/rooms/:code/join', route(async (req, res) => {
    const room = await lookupRoom(req, res)
    if (!room) return
    const result = joinPlayer(room, { name: req.body?.name, playerToken: req.body?.playerToken })
    if (result.error) {
      res.status(400).json({ error: result.error })
      return
    }
    result.player.online = true
    await remember(room)
    publishRoom(room)
    res.json(playerView(room, result.player.id))
  }))

  app.get('/api/rooms/:code/play', route(async (req, res) => {
    const room = await lookupRoom(req, res)
    if (!room) return
    const player = playerByToken(room, req.query.token)
    if (!player) {
      limitMiss(res, req.ip || 'unknown', 404, 'Вы не в комнате')
      return
    }
    res.json(playerView(room, player.id))
  }))

  app.post('/api/rooms/:code/answer', route(async (req, res) => {
    const room = await lookupRoom(req, res)
    if (!room) return
    const player = playerByToken(room, req.body?.playerToken)
    if (!player) {
      limitMiss(res, req.ip || 'unknown', 404, 'Вы не в комнате')
      return
    }
    const result = submitAnswer(room, player.id, req.body?.optionIndex)
    if (result.error) {
      res.status(400).json({ error: result.error })
      return
    }
    await remember(room)
    publishRoom(room)
    res.json(result)
  }))

  app.get('/api/rooms/:code', route(async (req, res) => {
    const room = await lookupRoom(req, res)
    if (!room) return
    res.json(publicInfo(room))
  }))
}
