import { createApp } from '../server/src/index.js'

const { app } = createApp()

export default function handler(req, res) {
  const url = req.url || '/'
  const queryIndex = url.indexOf('?')
  const path = queryIndex === -1 ? url : url.slice(0, queryIndex)
  const search = queryIndex === -1 ? '' : url.slice(queryIndex)
  if (!path.startsWith('/api/') && path !== '/api') {
    const suffix = path.startsWith('/') ? path : `/${path}`
    req.url = `/api${suffix}${search}`
  }
  return app(req, res)
}
