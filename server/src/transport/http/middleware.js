import express from 'express'
import { readSession } from '../../infrastructure/session.js'
import { profile } from '../../services/accounts.js'
import { bootAdmin } from '../../services/bootstrap.js'

// Запросы Socket.io, которые дошли до express (например, когда приложение — функция хостинга), отдаются движку io.
export function socketBridge(io) {
  return (req, res, next) => {
    if (!(req.url || '').startsWith('/socket.io')) return next()
    io.engine.handleRequest(req, res)
  }
}

// Уроки с картинками слайдов приходят большим JSON, остальным запросам хватает 256 КБ.
export function jsonBody() {
  return (req, res, next) => {
    const lessonWrite = (req.url || '').startsWith('/api/admin/lessons')
    return express.json({ limit: lessonWrite ? '8mb' : '256kb' })(req, res, next)
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

export function requireUser(req, res, next) {
  loadUser(req, res).then((user) => {
    if (user) next()
  }).catch((error) => {
    console.error(error)
    if (!res.headersSent) res.status(500).json({ error: 'Ошибка сервера' })
  })
}

export function requireHost(req, res, next) {
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

export function route(handler) {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      console.error(error)
      if (!res.headersSent) res.status(error.status || 500).json({ error: error.status ? error.message : 'Ошибка сервера' })
    })
  }
}
