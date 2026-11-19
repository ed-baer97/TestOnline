import express from 'express'
import { config } from '../../infrastructure/config.js'
import { readSession } from '../../infrastructure/session.js'
import { sessionProfile } from '../../services/accounts.js'
import { bootAdmin } from '../../services/bootstrap.js'

export function securityHeaders() {
  return (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    if (config.cookieSecure) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    }
    next()
  }
}

// Запросы Socket.io, которые дошли до express (например, когда приложение — функция хостинга), отдаются движку io.
export function socketBridge(io) {
  return (req, res, next) => {
    if (!(req.url || '').startsWith('/socket.io')) return next()
    io.engine.handleRequest(req, res)
  }
}

// Большой JSON урока разбирается в самом маршруте, уже после проверки входа.
function defersLessonJson(req) {
  if (req.method !== 'POST' && req.method !== 'PATCH') return false
  const path = (req.originalUrl || req.url || '').split('?')[0]
  if (req.method === 'POST' && path === '/api/admin/lessons') return true
  return req.method === 'PATCH' && /^\/api\/admin\/lessons\/[^/]+$/.test(path)
}

// Остальным запросам хватает 256 КБ. Тело урока с картинками слайдов сюда не попадает.
export function jsonBody() {
  const smallJson = express.json({ limit: '256kb' })
  return (req, res, next) => {
    if (defersLessonJson(req)) return next()
    return smallJson(req, res, next)
  }
}

// До первого ответа API создаются суперадмин и демо-урок (один раз на процесс).
export function bootstrap() {
  return (req, res, next) => {
    if ((req.url || '').startsWith('/socket.io')) return next()
    bootAdmin().then(() => next()).catch((error) => {
      console.error(error)
      if (!res.headersSent) res.status(500).json({ error: 'Ошибка сервера' })
    })
  }
}

async function loadUser(req, res) {
  const session = readSession(req.cookies.session)
  const user = session?.userId ? await sessionProfile(session) : null
  if (!user) {
    res.status(401).json({ error: 'Нужен вход' })
    return null
  }
  req.user = user
  req.userId = user.id
  return user
}

export function requireUser(req, res, next) {
  loadUser(req, res).then((user) => {
    if (user) next()
  }).catch((error) => {
    console.error(error)
    if (!res.headersSent) res.status(500).json({ error: 'Ошибка сервера' })
  })
}

function guardRole(allowed) {
  return (req, res, next) => {
    loadUser(req, res).then((user) => {
      if (!user) return
      if (!allowed.includes(user.role)) {
        res.status(403).json({ error: 'Недостаточно прав' })
        return
      }
      next()
    }).catch((error) => {
      console.error(error)
      if (!res.headersSent) res.status(500).json({ error: 'Ошибка сервера' })
    })
  }
}

export const requireHost = guardRole(['host'])

// Квизы платформы создаёт администратор платформы. Ведущий по-прежнему ведёт свои.
export const requireQuizAuthor = guardRole(['host', 'super'])

export function route(handler) {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      if (!error.status || error.status >= 500) console.error(error)
      if (!res.headersSent) res.status(error.status || 500).json({ error: error.status ? error.message : 'Ошибка сервера' })
    })
  }
}
