import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import cookieParser from 'cookie-parser'
import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { config } from './infrastructure/config.js'
import { lanAddresses } from './infrastructure/network.js'
import { readSession, signSession } from './infrastructure/session.js'
import { checkLesson, createLesson, deleteLesson, getLesson, importPptx, listLessons, openLessonFile, openLessonMedia, saveLessonVideo, updateLesson } from './services/lessons/index.js'
import { questionsFromXlsx, templateWorkbook } from './excel.js'
import { authenticate, profile } from './services/accounts.js'
import {
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
  listOrgAdmins,
  listOrganizations,
  listRegionalAdmins,
  listRegions,
  structure,
  updateClass,
  updateLearner,
  updateOrgAdmin,
  updateOrganization,
  updateRegion,
  updateRegionalAdmin,
  updateTrack,
} from './services/admin/index.js'
import { bootAdmin } from './services/bootstrap.js'
import { createQuiz, deleteQuiz, getQuiz, listQuizzes, updateQuiz } from './services/quizzes.js'
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
} from './services/rooms.js'
import { listResults, quizStats, statsOverview } from './services/stats.js'
import { attachRealtime } from './transport/realtime/socket.js'

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
    if (user.role !== 'host') {
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

function sendSession(res, user, status = 200) {
  res.cookie('session', signSession(user.id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
  })
  res.status(status).json({
    ok: true,
    login: user.login,
    role: user.role || 'host',
    displayName: user.displayName || user.login,
  })
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

  if (config.trustProxy) app.set('trust proxy', 1)

  app.use((req, res, next) => {
    if (!(req.url || '').startsWith('/socket.io')) return next()
    io.engine.handleRequest(req, res)
  })

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
    res.clearCookie('session', { path: '/' })
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
  app.get('/api/admin/organizations', guard, route(async (req, res) => {
    res.json({ organizations: await listOrganizations(req.user) })
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
  const accel = config.mediaAccel
  app.get('/api/lessons/:id/media', guard, route(async (req, res) => {
    const media = await openLessonMedia(req.user, req.params.id)
    if (accel) {
      res.setHeader('Content-Type', media.mime)
      res.setHeader('X-Accel-Redirect', `/media-internal/${req.params.id}`)
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
    res.json(await getLesson(req.user, req.params.id))
  }))
  app.post('/api/lessons/:id/check', guard, route(async (req, res) => {
    res.json(await checkLesson(req.user, req.params.id, req.body?.answers))
  }))
  app.put('/api/admin/lessons/:id/video', guard, express.raw({ type: () => true, limit: '80mb' }), route(async (req, res) => {
    let name = ''
    try {
      name = decodeURIComponent(String(req.get('x-file-name') || ''))
    } catch {
      name = ''
    }
    res.json(await saveLessonVideo(req.user, req.params.id, req.body, req.get('content-type'), name))
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
      res.status(201).json(await createQuiz(req.userId, req.body))
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  }))

  app.put('/api/quizzes/:id', requireHost, route(async (req, res) => {
    try {
      const quiz = await updateQuiz(req.params.id, req.userId, req.body)
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

  attachRealtime(io)

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Такого запроса нет' })
  })

  const clientDist = config.clientDist
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
if (isMain) {
  runtime.httpServer.listen(config.port, '0.0.0.0', () => {
    console.log(`TestOnline API http://localhost:${config.port}`)
  })
}
