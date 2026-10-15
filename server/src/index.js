import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cookieParser from 'cookie-parser'
import dotenv from 'dotenv'
import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import {
  bootAdmin,
  createClass,
  createLearner,
  createOrgAdmin,
  createOrganization,
  createRegion,
  createRegionalAdmin,
  createTrack,
  dashboard,
  deleteClass,
  deleteLearner,
  deleteOrgAdmin,
  deleteOrganization,
  deleteRegion,
  deleteRegionalAdmin,
  deleteTrack,
  importLearners,
  learnersTemplate,
  listLearners,
  orgStats,
  platformStats,
  listOrgAdmins,
  listOrganizations,
  listRegionalAdmins,
  listRegions,
  listDistricts,
  launchTargets,
  listLaunchQuizzes,
  privateAudience,
  quizForRoom,
  profile,
  structure,
  updateClass,
  updateLearner,
  updateOrgAdmin,
  updateOrganization,
  updateRegion,
  updateRegionalAdmin,
  updateTrack,
} from './admin.js'
import { authenticate, createQuiz, deleteQuiz, getQuiz, listQuizzes, listResults, quizStats, statsOverview, updateQuiz } from './db.js'
import { checkLesson, createLesson, deleteLesson, getLesson, importPptx, listLessons, openLessonFile, openLessonMedia, saveLessonVideo, updateLesson } from './lessons.js'
import { normalizeQuiz } from './domain.js'
import { questionsFromXlsx, templateWorkbook } from './excel.js'
import {
  advance,
  createRoom,
  getRoom,
  hostView,
  joinPlayer,
  listPrivateForClass,
  markOffline,
  noteCrowd,
  notePhase,
  openRoom,
  playerByToken,
  playerView,
  publicInfo,
  pushOne,
  submitAnswer,
  watch,
} from './rooms.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })
dotenv.config({ path: path.join(__dirname, '../..', '.env') })

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

function cookieValue(header, name) {
  for (const part of String(header || '').split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return ''
}

async function loadUser(req, res) {
  const session = readSession(req.cookies.session)
  if (!session?.userId) {
    res.status(401).json({ error: 'Нужен вход' })
    return null
  }
  const user = await profile(session.userId)
  if (!user) {
    res.status(401).json({ error: 'Нужен вход' })
    return null
  }
  req.user = user
  req.userId = user.id
  return user
}

function requireUser(req, res, next) {
  loadUser(req, res).then((user) => {
    if (user) next()
  }).catch((error) => {
    console.error(error)
    if (!res.headersSent) res.status(500).json({ error: 'Ошибка сервера' })
  })
}

function requireHost(req, res, next) {
  loadUser(req, res).then((user) => {
    if (!user) return
    if (user.role !== 'host' && user.role !== 'super') {
      res.status(403).json({ error: 'Недостаточно прав' })
      return
    }
    next()
  }).catch((error) => {
    console.error(error)
    if (!res.headersSent) res.status(500).json({ error: 'Ошибка сервера' })
  })
}

function route(handler) {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      console.error(error)
      if (!res.headersSent) res.status(error.status || 500).json({ error: error.status ? error.message : 'Ошибка сервера' })
    })
  }
}

function sessionCookie() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === '1',
    path: '/',
  }
}

function sendSession(res, user, status = 200) {
  res.cookie('session', signSession(user.id), sessionCookie())
  res.status(status).json({
    ok: true,
    login: user.login,
    role: user.role || 'host',
    displayName: user.displayName || user.login,
  })
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
  })

  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1)

  app.use(cookieParser())
  app.use((req, res, next) => {
    const lessonWrite = (req.url || '').startsWith('/api/admin/lessons')
    return express.json({ limit: lessonWrite ? '8mb' : '256kb' })(req, res, next)
  })
  app.use((req, res, next) => {
    if ((req.url || '').startsWith('/socket.io')) return next()
    bootAdmin().then(() => next()).catch((error) => {
      console.error(error)
      if (!res.headersSent) res.status(500).json({ error: 'Ошибка сервера' })
    })
  })

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.get('/api/network', (_req, res) => {
    res.json({ addresses: lanAddresses() })
  })

  app.post('/api/login', route(async (req, res) => {
    const user = await authenticate(req.body?.login, req.body?.password)
    if (!user) {
      res.status(401).json({ error: 'Неверный логин или пароль' })
      return
    }
    sendSession(res, await profile(user.id))
  }))

  app.post('/api/logout', (_req, res) => {
    res.clearCookie('session', sessionCookie())
    res.json({ ok: true })
  })

  app.get('/api/me', route(async (req, res) => {
    const session = readSession(req.cookies.session)
    const user = session?.userId ? await profile(session.userId) : null
    res.json(user ? { ok: true, ...user } : { ok: false })
  }))

  const guard = requireUser
  app.get('/api/admin/dashboard', guard, route(async (req, res) => {
    res.json(await dashboard(req.user))
  }))
  app.get('/api/admin/platform-stats', guard, route(async (req, res) => {
    const requested = typeof req.query.regionId === 'string' ? req.query.regionId : null
    res.json(await platformStats(req.user, requested || null))
  }))
  app.get('/api/admin/org-stats', guard, route(async (req, res) => {
    const requested = typeof req.query.organizationId === 'string' ? req.query.organizationId : null
    res.json(await orgStats(req.user, requested || null))
  }))
  app.get('/api/admin/regions', guard, route(async (req, res) => {
    res.json({ regions: await listRegions(req.user) })
  }))
  app.post('/api/admin/regions', guard, route(async (req, res) => {
    res.status(201).json(await createRegion(req.user, req.body || {}))
  }))
  app.patch('/api/admin/regions/:id', guard, route(async (req, res) => {
    res.json(await updateRegion(req.user, req.params.id, req.body || {}))
  }))
  app.delete('/api/admin/regions/:id', guard, route(async (req, res) => {
    await deleteRegion(req.user, req.params.id)
    res.json({ ok: true })
  }))
  app.get('/api/admin/regional-admins', guard, route(async (req, res) => {
    res.json({ admins: await listRegionalAdmins(req.user) })
  }))
  app.post('/api/admin/regional-admins', guard, route(async (req, res) => {
    res.status(201).json(await createRegionalAdmin(req.user, req.body || {}))
  }))
  app.patch('/api/admin/regional-admins/:id', guard, route(async (req, res) => {
    res.json(await updateRegionalAdmin(req.user, req.params.id, req.body || {}))
  }))
  app.delete('/api/admin/regional-admins/:id', guard, route(async (req, res) => {
    await deleteRegionalAdmin(req.user, req.params.id)
    res.json({ ok: true })
  }))
  app.get('/api/admin/districts', guard, route(async (req, res) => {
    res.json({ districts: await listDistricts(req.user) })
  }))
  app.get('/api/admin/organizations', guard, route(async (req, res) => {
    res.json({ organizations: await listOrganizations(req.user) })
  }))
  app.get('/api/admin/launch-targets', guard, route(async (req, res) => {
    res.json({ organizations: await launchTargets(req.user) })
  }))
  app.get('/api/admin/launch-quizzes', guard, route(async (req, res) => {
    res.json({ quizzes: await listLaunchQuizzes(req.user) })
  }))
  app.post('/api/admin/organizations', guard, route(async (req, res) => {
    res.status(201).json(await createOrganization(req.user, req.body || {}))
  }))
  app.patch('/api/admin/organizations/:id', guard, route(async (req, res) => {
    res.json(await updateOrganization(req.user, req.params.id, req.body || {}))
  }))
  app.delete('/api/admin/organizations/:id', guard, route(async (req, res) => {
    await deleteOrganization(req.user, req.params.id)
    res.json({ ok: true })
  }))
  app.get('/api/admin/org-admins', guard, route(async (req, res) => {
    res.json({ admins: await listOrgAdmins(req.user) })
  }))
  app.post('/api/admin/org-admins', guard, route(async (req, res) => {
    res.status(201).json(await createOrgAdmin(req.user, req.body || {}))
  }))
  app.patch('/api/admin/org-admins/:id', guard, route(async (req, res) => {
    res.json(await updateOrgAdmin(req.user, req.params.id, req.body || {}))
  }))
  app.delete('/api/admin/org-admins/:id', guard, route(async (req, res) => {
    await deleteOrgAdmin(req.user, req.params.id)
    res.json({ ok: true })
  }))
  app.get('/api/admin/structure', guard, route(async (req, res) => {
    res.json(await structure(req.user))
  }))
  app.post('/api/admin/tracks', guard, route(async (req, res) => {
    res.status(201).json(await createTrack(req.user, req.body || {}))
  }))
  app.patch('/api/admin/tracks/:id', guard, route(async (req, res) => {
    res.json(await updateTrack(req.user, req.params.id, req.body || {}))
  }))
  app.delete('/api/admin/tracks/:id', guard, route(async (req, res) => {
    await deleteTrack(req.user, req.params.id)
    res.json({ ok: true })
  }))
  app.post('/api/admin/classes', guard, route(async (req, res) => {
    res.status(201).json(await createClass(req.user, req.body || {}))
  }))
  app.patch('/api/admin/classes/:id', guard, route(async (req, res) => {
    res.json(await updateClass(req.user, req.params.id, req.body || {}))
  }))
  app.delete('/api/admin/classes/:id', guard, route(async (req, res) => {
    await deleteClass(req.user, req.params.id)
    res.json({ ok: true })
  }))
  app.get('/api/admin/learners', guard, route(async (req, res) => {
    res.json(await listLearners(req.user, req.query))
  }))
  app.get('/api/admin/learners/template', guard, route(async (req, res) => {
    if (req.user.role !== 'org') {
      res.status(403).json({ error: 'Недостаточно прав' })
      return
    }
    const buffer = await learnersTemplate()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="testiruemye-shablon.xlsx"')
    res.send(Buffer.from(buffer))
  }))
  app.post('/api/admin/learners/import', guard, express.raw({ type: () => true, limit: '5mb' }), route(async (req, res) => {
    res.json(await importLearners(req.user, req.body))
  }))
  app.post('/api/admin/learners', guard, route(async (req, res) => {
    res.status(201).json(await createLearner(req.user, req.body || {}))
  }))
  app.patch('/api/admin/learners/:id', guard, route(async (req, res) => {
    res.json(await updateLearner(req.user, req.params.id, req.body || {}))
  }))
  app.delete('/api/admin/learners/:id', guard, route(async (req, res) => {
    await deleteLearner(req.user, req.params.id)
    res.json({ ok: true })
  }))

  app.get('/api/lessons', guard, route(async (req, res) => {
    res.json({ lessons: await listLessons(req.user) })
  }))
  // MEDIA_ACCEL=1: Node только проверяет права, файл отдаёт Nginx по внутреннему адресу /media-internal/.
  const accel = process.env.MEDIA_ACCEL === '1'
  app.get('/api/lessons/:id/media', guard, route(async (req, res) => {
    const media = await openLessonMedia(req.user, req.params.id, req.query.lang)
    if (accel) {
      res.setHeader('Content-Type', media.mime)
      res.setHeader('X-Accel-Redirect', `/media-internal/${media.fileName}`)
      res.end()
      return
    }
    const total = media.size
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Content-Type', media.mime)
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''))
    let start = 0
    let end = total - 1
    if (match) {
      start = match[1] ? Number(match[1]) : 0
      end = match[2] ? Number(match[2]) : total - 1
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
        res.status(416).setHeader('Content-Range', `bytes */${total}`).end()
        return
      }
      end = Math.min(end, total - 1)
      res.status(206)
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`)
    }
    res.setHeader('Content-Length', end - start + 1)
    const stream = fs.createReadStream(media.path, { start, end })
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).end()
      else res.destroy()
    })
    stream.pipe(res)
  }))
  app.get('/api/lessons/files/:fileId', guard, route(async (req, res) => {
    const file = await openLessonFile(req.user, req.params.fileId)
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
    if (accel) {
      res.setHeader('Content-Type', file.mime)
      res.setHeader('X-Accel-Redirect', `/media-internal/files/${req.params.fileId}`)
      res.end()
      return
    }
    res.sendFile(file.path, {
      headers: { 'Content-Type': file.mime },
    }, (error) => {
      if (!error || res.headersSent) return
      res.status(error.status === 404 || error.code === 'ENOENT' ? 404 : 500).json({ error: 'Файл не найден' })
    })
  }))
  app.get('/api/lessons/:id', guard, route(async (req, res) => {
    res.json(await getLesson(req.user, req.params.id, req.query.lang))
  }))
  app.post('/api/lessons/:id/check', guard, route(async (req, res) => {
    res.json(await checkLesson(req.user, req.params.id, req.body?.answers, req.body?.lang))
  }))
  app.put('/api/admin/lessons/:id/video', guard, express.raw({ type: () => true, limit: '80mb' }), route(async (req, res) => {
    let name = ''
    try {
      name = decodeURIComponent(String(req.get('x-file-name') || ''))
    } catch {
      name = ''
    }
    res.json(await saveLessonVideo(req.user, req.params.id, req.body, req.get('content-type'), name, req.query.lang || req.get('x-lang')))
  }))
  app.post('/api/admin/lessons/pptx', guard, express.raw({ type: () => true, limit: '30mb' }), route(async (req, res) => {
    res.json(await importPptx(req.user, req.body))
  }))
  app.post('/api/admin/lessons', guard, route(async (req, res) => {
    res.status(201).json(await createLesson(req.user, req.body || {}))
  }))
  app.patch('/api/admin/lessons/:id', guard, route(async (req, res) => {
    res.json(await updateLesson(req.user, req.params.id, req.body || {}))
  }))
  app.delete('/api/admin/lessons/:id', guard, route(async (req, res) => {
    await deleteLesson(req.user, req.params.id)
    res.json({ ok: true })
  }))

  app.get('/api/stats', requireHost, route(async (req, res) => {
    res.json(await statsOverview(req.userId))
  }))

  app.get('/api/quizzes/:id/stats', requireHost, route(async (req, res) => {
    const stats = await quizStats(req.userId, req.params.id)
    if (!stats) {
      res.status(404).json({ error: 'Квиз не найден' })
      return
    }
    res.json(stats)
  }))

  app.get('/api/template', requireHost, async (_req, res) => {
    const buffer = await templateWorkbook()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="testonline-shablon.xlsx"')
    res.send(Buffer.from(buffer))
  })

  app.get('/api/quizzes', requireHost, route(async (req, res) => {
    res.json({ quizzes: await listQuizzes(req.userId) })
  }))

  app.get('/api/quizzes/:id', requireHost, route(async (req, res) => {
    const quiz = await getQuiz(req.params.id, req.userId)
    if (!quiz) {
      res.status(404).json({ error: 'Квиз не найден' })
      return
    }
    res.json(quiz)
  }))

  app.post('/api/import', requireHost, express.raw({ type: 'application/octet-stream', limit: '2mb' }), async (req, res) => {
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

  app.post('/api/quizzes', requireHost, route(async (req, res) => {
    try {
      res.status(201).json(await createQuiz(req.userId, normalizeQuiz(req.body)))
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  }))

  app.put('/api/quizzes/:id', requireHost, route(async (req, res) => {
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

  app.delete('/api/quizzes/:id', requireHost, route(async (req, res) => {
    if (!(await deleteQuiz(req.params.id, req.userId))) {
      res.status(404).json({ error: 'Квиз не найден' })
      return
    }
    res.json({ ok: true })
  }))

  app.get('/api/results', requireHost, route(async (req, res) => {
    res.json({ results: await listResults(req.userId) })
  }))

  app.get('/api/learn/live', requireUser, route(async (req, res) => {
    const quizzes = req.user.role === 'learner' ? await listPrivateForClass(req.user.classId) : []
    res.json({ quizzes })
  }))

  app.post('/api/rooms', requireUser, route(async (req, res) => {
    const mode = req.body?.mode === 'private' ? 'private' : 'public'
    const quiz = await quizForRoom(req.user, req.body?.quizId, mode)
    const audience = mode === 'private'
      ? await privateAudience(req.user, req.body?.organizationId, req.body?.classId)
      : null
    const room = await createRoom(quiz, audience)
    res.status(201).json({ code: room.code, hostToken: room.hostToken, title: room.quiz.title, access: room.audience.kind })
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
    await notePhase(room)
    res.json(hostView(room))
  }))

  app.post('/api/rooms/:code/join', route(async (req, res) => {
    const room = await openRoom(req.params.code)
    if (!room) {
      res.status(404).json({ error: 'Комната не найдена' })
      return
    }
    const session = readSession(req.cookies?.session)
    const user = session?.userId ? await profile(session.userId) : null
    const result = joinPlayer(room, { name: req.body?.name, playerToken: req.body?.playerToken, user })
    if (result.error) {
      res.status(400).json({ error: result.error })
      return
    }
    result.player.online = true
    noteCrowd(room)
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
    noteCrowd(room)
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
      const room = await openRoom(code)
      if (!room || room.hostToken !== hostToken) {
        ack?.({ error: 'Комната не найдена или сессия ведущего устарела' })
        return
      }
      socket.data.role = 'host'
      socket.data.code = room.code
      socket.join(room.code)
      pushOne(socket, room)
      ack?.({ ok: true })
    })

    socket.on('player:join', async ({ code, name, playerToken } = {}, ack) => {
      const room = await openRoom(code)
      if (!room) {
        ack?.({ error: 'Комната не найдена' })
        return
      }
      const session = readSession(cookieValue(socket.handshake.headers.cookie, 'session'))
      const user = session?.userId ? await profile(session.userId) : null
      const result = joinPlayer(room, { name, playerToken, user })
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
      noteCrowd(room)
      pushOne(socket, room)
      ack?.({ ok: true, name: result.player.name })
    })

    socket.on('host:advance', async (ack) => {
      const room = await openRoom(socket.data.code)
      if (socket.data.role !== 'host' || !room) {
        ack?.({ error: 'Нет доступа' })
        return
      }
      if (!advance(room, io)) {
        ack?.({ error: 'Сейчас это действие недоступно' })
        return
      }
      await notePhase(room)
      ack?.({ ok: true, status: room.status })
    })

    socket.on('player:answer', async ({ optionIndex } = {}, ack) => {
      const room = await openRoom(socket.data.code)
      if (socket.data.role !== 'player' || !room) {
        ack?.({ error: 'Вы не в комнате' })
        return
      }
      const result = submitAnswer(room, socket.data.playerId, optionIndex)
      if (result.ok) noteCrowd(room)
      ack?.(result)
    })

    socket.on('disconnect', () => {
      const room = getRoom(socket.data.code)
      if (!room || socket.data.role !== 'player') return
      if (markOffline(room, socket.data.playerId, socket.id)) noteCrowd(room)
    })
  })

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Такого запроса нет' })
  })

  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist')
  const serveClient = process.env.NODE_ENV === 'production' || process.env.SERVE_CLIENT === '1'
  if (serveClient) {
    app.use(express.static(clientDist))
    app.get(/^(?!\/api|\/socket\.io).*/, (req, res, next) => {
      if (req.method !== 'GET') return next()
      res.sendFile(path.join(clientDist, 'index.html'), (error) => {
        if (error) next()
      })
    })
  }

  return { app, httpServer, io }
}

const runtime = createApp()

const entry = process.argv[1] ? path.resolve(process.argv[1]) : ''
const isMain = entry === fileURLToPath(import.meta.url) || path.basename(entry) === 'start.js'
if (isMain) {
  runtime.httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(process.env.NODE_ENV === 'production'
      ? `TestOnline слушает порт ${PORT}`
      : `TestOnline API на порту ${PORT}. Сайт: http://localhost:5174`)
  })
}
