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
} from '../../../services/rooms.js'
import { requireHost, route } from '../middleware.js'

// Комнатой управляют по hostToken и playerToken, а не по cookie: экран ведущего и телефоны входят без логина.
export function registerRoomRoutes(app) {
  app.post('/api/rooms', requireHost, route(async (req, res) => {
    const quiz = await getQuiz(req.body?.quizId, req.userId)
    if (!quiz) {
      res.status(404).json({ error: 'Квиз не найден' })
      return
    }
    const room = await createRoom(quiz)
    res.status(201).json({ code: room.code, hostToken: room.hostToken, title: room.quiz.title })
  }))

  app.get('/api/rooms/:code/host', route(async (req, res) => {
    const room = await openRoom(req.params.code)
    if (!room || room.hostToken !== req.query.token) {
      res.status(404).json({ error: 'Комната не найдена' })
      return
    }
    res.json(hostView(room))
  }))

  app.post('/api/rooms/:code/advance', route(async (req, res) => {
    const room = await openRoom(req.params.code)
    if (!room || room.hostToken !== req.body?.hostToken) {
      res.status(404).json({ error: 'Комната не найдена' })
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
    const room = await openRoom(req.params.code)
    if (!room) {
      res.status(404).json({ error: 'Комната не найдена' })
      return
    }
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
    const room = await openRoom(req.params.code)
    if (!room) {
      res.status(404).json({ error: 'Комната не найдена' })
      return
    }
    const player = playerByToken(room, req.query.token)
    if (!player) {
      res.status(404).json({ error: 'Вы не в комнате' })
      return
    }
    res.json(playerView(room, player.id))
  }))

  app.post('/api/rooms/:code/answer', route(async (req, res) => {
    const room = await openRoom(req.params.code)
    if (!room) {
      res.status(404).json({ error: 'Комната не найдена' })
      return
    }
    const player = playerByToken(room, req.body?.playerToken)
    if (!player) {
      res.status(404).json({ error: 'Вы не в комнате' })
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
    const room = await openRoom(req.params.code)
    if (!room) {
      res.status(404).json({ error: 'Комната не найдена' })
      return
    }
    res.json(publicInfo(room))
  }))
}
