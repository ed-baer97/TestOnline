import { lanAddresses } from '../../../infrastructure/network.js'

export function registerSystemRoutes(app) {
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.get('/api/network', (_req, res) => {
    res.json({ addresses: lanAddresses() })
  })
}
