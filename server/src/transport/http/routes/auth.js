import { config } from '../../../infrastructure/config.js'
import { readSession, signSession } from '../../../infrastructure/session.js'
import { authenticate, profile } from '../../../services/accounts.js'
import { route } from '../middleware.js'

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

export function registerAuthRoutes(app) {
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
}
