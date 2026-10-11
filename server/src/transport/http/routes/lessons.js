import fs from 'node:fs'
import express from 'express'
import { config } from '../../../infrastructure/config.js'
import {
  checkLesson,
  createLesson,
  deleteLesson,
  getLesson,
  importPptx,
  listLessons,
  openLessonFile,
  openLessonMedia,
  saveLessonVideo,
  updateLesson,
} from '../../../services/lessons/index.js'
import { requireUser, route } from '../middleware.js'

export function registerLessonRoutes(app) {
  const guard = requireUser
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
      const suffix = !match[1] && Boolean(match[2])
      start = suffix ? Math.max(0, total - Number(match[2])) : match[1] ? Number(match[1]) : 0
      end = match[2] && !suffix ? Number(match[2]) : total - 1
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
    let name
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
}
