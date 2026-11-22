import fs from 'node:fs'
import express from 'express'
import { config } from '../../../infrastructure/config.js'
import {
  MAX_VIDEO,
  assignLessonSection,
  checkLesson,
  createLesson,
  createLessonSection,
  deleteLesson,
  deleteLessonSection,
  deleteLessonVideo,
  getLesson,
  importPptx,
  listLessonSections,
  listLessons,
  openLessonFile,
  openLessonMedia,
  reorderLesson,
  saveLessonVideo,
  updateLesson,
  updateLessonSection,
} from '../../../services/lessons/index.js'
import { requireUser, route } from '../middleware.js'

const largeLessonJson = express.json({ limit: '16mb' })

export function registerLessonRoutes(app) {
  const guard = requireUser
  app.get('/api/lessons', guard, route(async (req, res) => {
    res.json({ lessons: await listLessons(req.user) })
  }))
  const accel = config.mediaAccel
  app.get('/api/lessons/:id/media', guard, route(async (req, res) => {
    const media = await openLessonMedia(req.user, req.params.id, req.query.lang)
    if (accel) {
      res.setHeader('Content-Type', media.mime)
      res.setHeader('X-Accel-Redirect', `/media-internal/${media.fileName}`)
      res.end()
      return
    }
    const total = media.size
    if (total <= 0) {
      res.status(404).json({ error: 'Видео не найдено' })
      return
    }
    const etag = `W/"${total}-${Math.trunc(media.mtimeMs || 0)}"`
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Content-Type', media.mime)
    res.setHeader('Cache-Control', 'private, max-age=3600')
    res.setHeader('ETag', etag)
    if (!req.headers.range && req.headers['if-none-match'] === etag) {
      res.status(304).end()
      return
    }
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''))
    let start = 0
    let end = total - 1
    if (match) {
      if (!match[1] && !match[2]) {
        res.status(416).setHeader('Content-Range', `bytes */${total}`).end()
        return
      }
      const suffix = !match[1] && Boolean(match[2])
      start = suffix ? Math.max(0, total - Number(match[2])) : Number(match[1])
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
    res.on('close', () => stream.destroy())
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
  app.put('/api/admin/lessons/:id/video', guard, route(async (req, res) => {
    const length = Number(req.headers['content-length'])
    if (Number.isFinite(length) && length > MAX_VIDEO) {
      res.status(413).json({ error: 'Видео больше 250 МБ' })
      return
    }
    let name
    try {
      name = decodeURIComponent(String(req.get('x-file-name') || ''))
    } catch {
      name = ''
    }
    res.json(await saveLessonVideo(req.user, req.params.id, req, req.get('content-type'), name, req.query.lang || req.get('x-lang')))
  }))
  app.delete('/api/admin/lessons/:id/video', guard, route(async (req, res) => {
    res.json(await deleteLessonVideo(req.user, req.params.id, req.query.lang || req.get('x-lang')))
  }))
  app.post('/api/admin/lessons/pptx', guard, express.raw({ type: () => true, limit: '30mb' }), route(async (req, res) => {
    res.json(await importPptx(req.user, req.body, req.query.lang || req.get('x-lang')))
  }))
  app.post('/api/admin/lessons', guard, largeLessonJson, route(async (req, res) => {
    res.status(201).json(await createLesson(req.user, req.body || {}))
  }))
  app.patch('/api/admin/lessons/:id', guard, largeLessonJson, route(async (req, res) => {
    res.json(await updateLesson(req.user, req.params.id, req.body || {}))
  }))
  app.delete('/api/admin/lessons/:id', guard, route(async (req, res) => {
    await deleteLesson(req.user, req.params.id)
    res.json({ ok: true })
  }))
  app.get('/api/admin/lesson-sections', guard, route(async (req, res) => {
    res.json({ sections: await listLessonSections(req.user) })
  }))
  app.post('/api/admin/lesson-sections', guard, route(async (req, res) => {
    res.status(201).json(await createLessonSection(req.user, req.body || {}))
  }))
  app.patch('/api/admin/lesson-sections/:id', guard, route(async (req, res) => {
    res.json(await updateLessonSection(req.user, req.params.id, req.body || {}))
  }))
  app.delete('/api/admin/lesson-sections/:id', guard, route(async (req, res) => {
    await deleteLessonSection(req.user, req.params.id)
    res.json({ ok: true })
  }))
  app.patch('/api/admin/lessons/:id/section', guard, route(async (req, res) => {
    res.json(await assignLessonSection(req.user, req.params.id, req.body?.sectionId))
  }))
  app.patch('/api/admin/lessons/:id/order', guard, route(async (req, res) => {
    res.json(await reorderLesson(req.user, req.params.id, req.body || {}))
  }))
}
