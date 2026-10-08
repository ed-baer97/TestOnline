import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import cookieParser from 'cookie-parser'
import dotenv from 'dotenv'
import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { authenticate, createQuiz, deleteQuiz, getQuiz, getUser, listQuizzes, listResults, quizStats, registerUser, statsOverview, updateQuiz } from './db.js'
import { normalizeAccount, normalizeQuiz } from './domain.js'
import { questionsFromXlsx, templateWorkbook } from './excel.js'
import {
  advance,
  createRoom,
  getRoom,
  hostView,
  joinPlayer,
  markOffline,
  openRoom,
  playerByToken,
  playerView,
  publicInfo,
  push,
  remember,
  submitAnswer,
  watch,
} from './rooms.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const SECRET = process.env.SESSION_SECRET || 'testonline-dev-secret'
const PORT = Number(process.env.PORT || 3001)

function signSession(userId) {
  const data = Buffer.from(JSON.stringify({ userId, exp: Date.now() + 14 * 24 * 60 * 60 * 1000 })).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url')
  return `${data}.${sig}`
}

function readSession(token) {
  if (!token || !token.includes('.')) return null
  const [data, sig] = token.split('.')
  const expected = crypto.createHmac('sha256', SECRET).update(data).digest('base64url')
  const left = Buffer.from(sig)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString())
    if (!payload?.exp || payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

function requireAdmin(req, res, next) {
  const session = readSession(req.cookies.session)
  if (!session?.userId) {
    res.status(401).json({ error: 'Нужен вход' })
    return
  }
  req.userId = session.userId
  next()
}

function route(handler) {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      console.error(error)
      if (!res.headersSent) res.status(error.status || 500).json({ error: error.status ? error.message : 'Ошибка сервера' })
    })
  }
}

function sendSession(res, user, status = 200) {
  res.cookie('session', signSession(user.id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.VERCEL === '1',
    path: '/',
  })
  res.status(status).json({ ok: true, login: user.login })
}
function lanAddresses() {
  const found = []
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets || []) {
      const family = net.family === 'IPv4' || net.family === 4
      if (!family || net.internal) continue
      found.push(net.address)
    }
  }
  const rank = (ip) => {
    if (ip.startsWith('192.168.')) return 3
    if (ip.startsWith('10.')) return 2
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return 1
    return 0
  }
  return found.sort((a, b) => rank(b) - rank(a))
}

export function createApp() {
  const app = express()
  const httpServer = createServer(app)
  const io = new Server(httpServer, {
    pingInterval: 10000,
    pingTimeout: 20000,
    maxHttpBufferSize: 1e5,
    addTrailingSlash: false,
  })

  if (process.env.VERCEL) {
    app.use((req, _res, next) => {
      const url = req.url || '/'
      if (url.startsWith('/socket.io') || url.startsWith('/api/') || url === '/api' || url.startsWith('/api?')) return next()
      const query = url.indexOf('?')
      const path = query === -1 ? url : url.slice(0, query)
      const search = query === -1 ? '' : url.slice(query)
      if (/[?&]EIO=/.test(search) || /[?&]transport=(polling|websocket)/.test(search)) {
        const suffix = path === '/' ? '' : (path.startsWith('/') ? path : `/${path}`)
        req.url = `/socket.io${suffix}${search}`
        return next()
      }
      const suffix = path.startsWith('/') ? path : `/${path}`
      req.url = `/api${suffix}${search}`
      next()
    })
  }

  app.use((req, res, next) => {
    if (!(req.url || '').startsWith('/socket.io')) return next()
    io.engine.handleRequest(req, res)
  })

  app.use(cookieParser())
  app.use(express.json({ limit: '256kb' }))

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.get('/api/network', (_req, res) => {
    res.json({ addresses: lanAddresses() })
  })

  app.post('/api/register', route(async (req, res) => {
    try {
      const user = await registerUser(normalizeAccount(req.body || {}))
      sendSession(res, user, 201)
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message })
    }
  }))

  app.post('/api/login', route(async (req, res) => {
    const user = await authenticate(req.body?.login, req.body?.password)
    if (!user) {
      res.status(401).json({ error: 'Неверный логин или пароль' })
      return
    }
    sendSession(res, user)
  }))

  app.post('/api/logout', (_req, res) => {
    res.clearCookie('session', { path: '/' })
    res.json({ ok: true })
  })

  app.get('/api/me', route(async (req, res) => {
    const session = readSession(req.cookies.session)
    const user = session?.userId ? await getUser(session.userId) : null
    res.json(user ? { ok: true, login: user.login } : { ok: false })
  }))

  app.get('/api/stats', requireAdmin, route(async (req, res) => {
    res.json(await statsOverview(req.userId))
  }))

  app.get('/api/quizzes/:id/stats', requireAdmin, route(async (req, res) => {
    const stats = await quizStats(req.userId, req.params.id)
    if (!stats) {
      res.status(404).json({ error: 'Квиз не найден' })
      return
    }
    res.json(stats)
  }))

  app.get('/api/template', requireAdmin, async (_req, res) => {
    const buffer = await templateWorkbook()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="testonline-shablon.xlsx"')
    res.send(Buffer.from(buffer))
  })

  app.get('/api/quizzes', requireAdmin, route(async (req, res) => {
    res.json({ quizzes: await listQuizzes(req.userId) })
  }))

  app.get('/api/quizzes/:id', requireAdmin, route(async (req, res) => {
    const quiz = await getQuiz(req.params.id, req.userId)
    if (!quiz) {
      res.status(404).json({ error: 'Квиз не найден' })
      return
    }
    res.json(quiz)
  }))

  app.post('/api/import', requireAdmin, express.raw({ type: 'application/octet-stream', limit: '2mb' }), async (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: 'Файл пустой' })
        return
      }
      res.json({ questions: await questionsFromXlsx(req.body) })
    } catch (error) {
      res.status(error.status || 400).json({
        error: error.status ? error.message : 'Не удалось прочитать файл. Нужен Excel .xlsx',
      })
    }
  })

  app.post('/api/quizzes', requireAdmin, route(async (req, res) => {
    try {
      res.status(201).json(await createQuiz(req.userId, normalizeQuiz(req.body)))
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  }))

  app.put('/api/quizzes/:id', requireAdmin, route(async (req, res) => {
    try {
      const quiz = await updateQuiz(req.params.id, req.userId, normalizeQuiz(req.body))
      if (!quiz) {
        res.status(404).json({ error: 'Квиз не найден' })
        return
      }
      res.json(quiz)
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  }))

  app.delete('/api/quizzes/:id', requireAdmin, route(async (req, res) => {
    if (!(await deleteQuiz(req.params.id, req.userId))) {
      res.status(404).json({ error: 'Квиз не найден' })
      return
    }
    res.json({ ok: true })
  }))

  app.get('/api/results', requireAdmin, route(async (req, res) => {
    res.json({ results: await listResults(req.userId) })
  }))

  app.post('/api/rooms', requireAdmin, route(async (req, res) => {
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
    if (!advance(room, io)) {
      res.status(400).json({ error: 'Сейчас это действие недоступно' })
      return
    }
    await remember(room)
    push(io, room)
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
    push(io, room)
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
    push(io, room)
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

  io.on('connection', (socket) => {
    watch(socket)

    socket.on('host:join', async ({ code, hostToken } = {}, ack) => {
      const room = getRoom(code) || await openRoom(code)
      if (!room || room.hostToken !== hostToken) {
        ack?.({ error: 'Комната не найдена или сессия ведущего устарела' })
        return
      }
      socket.data.role = 'host'
      socket.data.code = room.code
      socket.join(room.code)
      ack?.({ ok: true })
      push(io, room)
    })

    socket.on('player:join', async ({ code, name, playerToken } = {}, ack) => {
      const room = getRoom(code) || await openRoom(code)
      if (!room) {
        ack?.({ error: 'Комната не найдена' })
        return
      }
      const result = joinPlayer(room, { name, playerToken })
      if (result.error) {
        ack?.({ error: result.error })
        return
      }
      result.player.online = true
      result.player.socketId = socket.id
      socket.data.role = 'player'
      socket.data.code = room.code
      socket.data.playerId = result.player.id
      socket.join(room.code)
      await remember(room)
      ack?.({ ok: true, name: result.player.name })
      push(io, room)
    })

    socket.on('host:advance', async (ack) => {
      const room = getRoom(socket.data.code) || await openRoom(socket.data.code)
      if (socket.data.role !== 'host' || !room) {
        ack?.({ error: 'Нет доступа' })
        return
      }
      if (!advance(room, io)) {
        ack?.({ error: 'Сейчас это действие недоступно' })
        return
      }
      await remember(room)
      ack?.({ ok: true, status: room.status })
      push(io, room)
    })

    socket.on('player:answer', async ({ optionIndex } = {}, ack) => {
      const room = getRoom(socket.data.code) || await openRoom(socket.data.code)
      if (socket.data.role !== 'player' || !room) {
        ack?.({ error: 'Вы не в комнате' })
        return
      }
      const result = submitAnswer(room, socket.data.playerId, optionIndex)
      if (result.ok) await remember(room)
      ack?.(result)
      if (result.ok) push(io, room)
    })

    socket.on('disconnect', () => {
      const room = getRoom(socket.data.code)
      if (!room || socket.data.role !== 'player') return
      if (markOffline(room, socket.data.playerId, socket.id)) push(io, room)
    })
  })

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Такого запроса нет' })
  })

  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist')
  app.use(express.static(clientDist))
  app.get(/^(?!\/api|\/socket\.io).*/, (req, res, next) => {
    if (req.method !== 'GET') return next()
    res.sendFile(path.join(clientDist, 'index.html'), (error) => {
      if (error) next()
    })
  })

  return { app, httpServer, io }
}

const runtime = createApp()
export default runtime.app

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isMain || process.env.VERCEL === '1') {
  runtime.httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`TestOnline API http://localhost:${PORT}`)
  })
}
