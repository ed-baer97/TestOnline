import { lanAddresses } from '../../../infrastructure/network.js'
import { checkHealth, shutdownServices } from '../../../services/system.js'
import { requireQuizAuthor, route } from '../middleware.js'

export function registerSystemRoutes(app) {
  app.get('/api/health', route(async (_req, res) => {
    try {
      res.json(await checkHealth())
    } catch (error) {
      console.error('Ошибка проверки базы данных', error)
      res.status(503).json({ ok: false, error: 'База данных недоступна' })
    }
  }))

  app.get('/api/network', requireQuizAuthor, (_req, res) => {
    res.json({ addresses: lanAddresses() })
  })
}

export async function closeServer(httpServer, io) {
  io.close()
  await new Promise((resolve) => {
    if (!httpServer.listening) {
      resolve()
      return
    }
    httpServer.close(() => resolve())
  })
  await shutdownServices()
}
