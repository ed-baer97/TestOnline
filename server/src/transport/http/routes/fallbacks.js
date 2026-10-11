import path from 'node:path'
import express from 'express'
import { config } from '../../../infrastructure/config.js'

// Регистрируется последним: неизвестный /api — 404 в JSON, остальное — собранный клиент и index.html для маршрутов SPA.
export function registerFallbacks(app) {
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
}
