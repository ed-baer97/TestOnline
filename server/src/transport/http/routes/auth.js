import { config } from '../../../infrastructure/config.js'
import { SESSION_TTL_MS, readSession, signSession } from '../../../infrastructure/session.js'
import { authenticate, profile, registerAccount, registrationOptions, sessionProfile } from '../../../services/accounts.js'
import { route } from '../middleware.js'
import { createRateLimiter } from '../rateLimit.js'

const LOGIN_WINDOW_MS = 60 * 1000
// Логин считается отдельно от адреса: десять ошибок на один логин с любых IP.
// Потолок на IP выше, чтобы класс за общим NAT не запирал кабинет друг другу.
const LOGIN_ACCOUNT_MAX = 10
const LOGIN_IP_MAX = 120
const loginAccountLimiter = createRateLimiter({ windowMs: LOGIN_WINDOW_MS, max: LOGIN_ACCOUNT_MAX })
const loginIpLimiter = createRateLimiter({ windowMs: LOGIN_WINDOW_MS, max: LOGIN_IP_MAX })
const registerIpLimiter = createRateLimiter({ windowMs: LOGIN_WINDOW_MS, max: 20 })

function sendSession(res, user, passwordHash, status = 200) {
  res.cookie('session', signSession(user.id, passwordHash), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: SESSION_TTL_MS,
    path: '/',
  })
  res.status(status).json({
    ok: true,
    login: user.login,
    role: user.role || 'host',
    displayName: user.displayName || user.login,
  })
}

function loginKeys(req) {
  const ip = req.ip || 'unknown'
  const login = String(req.body?.login || '').trim().toLowerCase()
  return { ip, login }
}

export function registerAuthRoutes(app) {
  app.post('/api/login', route(async (req, res) => {
    const keys = loginKeys(req)
    if (loginAccountLimiter.isBlocked(keys.login)) {
      res.status(429).json({ error: 'Слишком много попыток входа. Попробуйте через минуту' })
      return
    }
    const user = await authenticate(req.body?.login, req.body?.password)
    if (!user) {
      if (loginIpLimiter.isBlocked(keys.ip)) {
        res.status(429).json({ error: 'Слишком много попыток входа. Попробуйте через минуту' })
        return
      }
      loginAccountLimiter.hit(keys.login)
      loginIpLimiter.hit(keys.ip)
      res.status(401).json({ error: 'Неверный логин или пароль' })
      return
    }
    loginAccountLimiter.reset(keys.login)
    loginIpLimiter.reset(keys.ip)
    sendSession(res, await profile(user.id), user.passwordHash)
  }))

  app.post('/api/logout', (_req, res) => {
    res.clearCookie('session', {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      path: '/',
    })
    res.json({ ok: true })
  })

  app.get('/api/me', route(async (req, res) => {
    const session = readSession(req.cookies.session)
    const user = session?.userId ? await sessionProfile(session) : null
    res.json(user ? { ok: true, ...user } : { ok: false })
  }))

  app.get('/api/register/options', route(async (_req, res) => {
    res.json(await registrationOptions())
  }))

  app.post('/api/register', route(async (req, res) => {
    const ip = req.ip || 'unknown'
    if (registerIpLimiter.isBlocked(ip)) {
      res.status(429).json({ error: 'Слишком много запросов. Попробуйте через минуту' })
      return
    }
    registerIpLimiter.hit(ip)
    const { user, passwordHash } = await registerAccount(req.body || {})
    sendSession(res, user, passwordHash, 201)
  }))
}
