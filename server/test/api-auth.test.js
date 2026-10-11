import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createHost, useTestDatabase } from './helpers/db.js'
import { call, login, startServer } from './helpers/http.js'

await useTestDatabase('api-auth')
process.env.SESSION_SECRET = 'test-secret'
process.env.SUPER_LOGIN = 'root'
process.env.SUPER_PASSWORD = 'rootpass'

function forgeSession(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', 'test-secret').update(data).digest('base64url')
  return `session=${data}.${sig}`
}

test('служебные адреса и неизвестные запросы', async (t) => {
  const server = await startServer()
  t.after(() => server.close())
  const { base } = server

  const health = await call(base, '/api/health')
  assert.equal(health.status, 200)
  assert.deepEqual(health.body, { ok: true })

  const network = await call(base, '/api/network')
  assert.equal(network.status, 200)
  assert.deepEqual(Object.keys(network.body), ['addresses'])
  assert.ok(Array.isArray(network.body.addresses))

  for (const [method, url] of [['GET', '/api/nothing'], ['POST', '/api/quizzes/a/b/c'], ['DELETE', '/api/rooms']]) {
    const missing = await call(base, url, { method })
    assert.equal(missing.status, 404, `${method} ${url}`)
    assert.deepEqual(missing.body, { error: 'Такого запроса нет' })
  }

  const handshake = await call(base, '/socket.io/?EIO=4&transport=polling')
  assert.equal(handshake.status, 200)
  assert.match(handshake.text, /^0\{"sid":/)
})

test('вход, профиль, выход и cookie сессии', async (t) => {
  const server = await startServer()
  t.after(() => server.close())
  const { base } = server
  const host = await createHost('host', 'secret1')

  assert.deepEqual((await call(base, '/api/me')).body, { ok: false })

  const wrong = await call(base, '/api/login', { method: 'POST', json: { login: 'host', password: 'nope-nope' } })
  assert.equal(wrong.status, 401)
  assert.deepEqual(wrong.body, { error: 'Неверный логин или пароль' })
  const empty = await call(base, '/api/login', { method: 'POST' })
  assert.equal(empty.status, 401)
  assert.deepEqual(empty.body, { error: 'Неверный логин или пароль' })

  const ok = await call(base, '/api/login', { method: 'POST', json: { login: ' HOST ', password: 'secret1' } })
  assert.equal(ok.status, 200)
  assert.deepEqual(ok.body, { ok: true, login: 'host', role: 'host', displayName: 'host' })
  const setCookie = ok.headers.get('set-cookie')
  assert.match(setCookie, /^session=[\w-]+\.[\w-]+; Path=\/; HttpOnly; SameSite=Lax$/)
  const cookie = setCookie.split(';')[0]

  const me = await call(base, '/api/me', { cookie })
  assert.equal(me.status, 200)
  assert.deepEqual(me.body, {
    ok: true,
    id: host.id,
    login: 'host',
    role: 'host',
    displayName: 'host',
    regionId: null,
    regionName: null,
    organizationId: null,
    organizationName: null,
    classId: null,
    className: null,
    classLabel: null,
    band: null,
  })

  const [data, sig] = cookie.slice('session='.length).split('.')
  const flipped = `session=${data}.${sig.startsWith('A') ? 'B' : 'A'}${sig.slice(1)}`
  assert.deepEqual((await call(base, '/api/me', { cookie: flipped })).body, { ok: false })
  assert.deepEqual((await call(base, '/api/me', { cookie: 'session=garbage' })).body, { ok: false })
  assert.deepEqual((await call(base, '/api/me', { cookie: forgeSession({ userId: host.id, exp: Date.now() - 1000 }) })).body, { ok: false })
  assert.deepEqual((await call(base, '/api/me', { cookie: forgeSession({ userId: 'nobody', exp: Date.now() + 60000 }) })).body, { ok: false })
  assert.equal((await call(base, '/api/me', { cookie: forgeSession({ userId: host.id, exp: Date.now() + 60000 }) })).body.login, 'host')

  const logout = await call(base, '/api/logout', { method: 'POST', cookie })
  assert.equal(logout.status, 200)
  assert.deepEqual(logout.body, { ok: true })
  assert.equal(logout.headers.get('set-cookie'), 'session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT')

  process.env.COOKIE_SECURE = '1'
  try {
    const secure = await call(base, '/api/login', { method: 'POST', json: { login: 'host', password: 'secret1' } })
    assert.match(secure.headers.get('set-cookie'), /^session=[\w-]+\.[\w-]+; Path=\/; HttpOnly; Secure; SameSite=Lax$/)
  } finally {
    delete process.env.COOKIE_SECURE
  }
})

test('права: без входа 401, чужая роль 403', async (t) => {
  const server = await startServer()
  t.after(() => server.close())
  const { base } = server
  await createHost('host2', 'secret1')
  const hostCookie = await login(base, 'host2', 'secret1')
  const rootCookie = await login(base, 'root', 'rootpass')

  for (const url of ['/api/quizzes', '/api/stats', '/api/results', '/api/template', '/api/admin/dashboard', '/api/lessons']) {
    const anonymous = await call(base, url)
    assert.equal(anonymous.status, 401, url)
    assert.deepEqual(anonymous.body, { error: 'Нужен вход' })
  }
  const ghost = await call(base, '/api/quizzes', { cookie: forgeSession({ userId: 'nobody', exp: Date.now() + 60000 }) })
  assert.equal(ghost.status, 401)
  assert.deepEqual(ghost.body, { error: 'Нужен вход' })

  for (const url of ['/api/quizzes', '/api/stats', '/api/template']) {
    const denied = await call(base, url, { cookie: rootCookie })
    assert.equal(denied.status, 403, url)
    assert.deepEqual(denied.body, { error: 'Недостаточно прав' })
  }
  const hostAdmin = await call(base, '/api/admin/dashboard', { cookie: hostCookie })
  assert.equal(hostAdmin.status, 403)
  assert.deepEqual(hostAdmin.body, { error: 'Недостаточно прав' })
  const hostLessons = await call(base, '/api/lessons', { cookie: hostCookie })
  assert.equal(hostLessons.status, 403)
  assert.deepEqual(hostLessons.body, { error: 'Недостаточно прав' })
})

test('разбор тела запроса: лимиты и битый JSON', async (t) => {
  const server = await startServer()
  t.after(() => server.close())
  const { base } = server
  const rootCookie = await login(base, 'root', 'rootpass')

  const tooBig = await call(base, '/api/login', { method: 'POST', json: { login: 'root', password: 'x'.repeat(300 * 1024) } })
  assert.equal(tooBig.status, 413)
  const broken = await call(base, '/api/login', { method: 'POST', body: '{"login":', headers: { 'Content-Type': 'application/json' } })
  assert.equal(broken.status, 400)

  const lessonBody = await call(base, '/api/admin/lessons', { method: 'POST', cookie: rootCookie, json: { title: 'x', pad: 'a'.repeat(1024 * 1024) } })
  assert.equal(lessonBody.status, 400)
  assert.deepEqual(lessonBody.body, { error: 'Название урока: от 2 до 80 символов' })
})

test('TRUST_PROXY включает trust proxy', async () => {
  const { createApp } = await import('../src/index.js')
  process.env.TRUST_PROXY = '1'
  try {
    const { app, io } = createApp()
    assert.equal(app.get('trust proxy'), 1)
    io.close()
  } finally {
    delete process.env.TRUST_PROXY
  }
  const { app, io } = createApp()
  assert.equal(app.get('trust proxy'), false)
  io.close()
})

test('собранный клиент и запасной маршрут SPA', async (t) => {
  const server = await startServer()
  t.after(() => server.close())
  const { base } = server
  const indexFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist', 'index.html')
  const page = await call(base, '/host/quizzes')
  if (fs.existsSync(indexFile)) {
    assert.equal(page.status, 200)
    assert.match(page.headers.get('content-type'), /text\/html/)
    assert.equal(page.text, fs.readFileSync(indexFile, 'utf8'))
  } else {
    assert.equal(page.status, 404)
  }
  const api = await call(base, '/api/host/quizzes')
  assert.equal(api.status, 404)
  assert.deepEqual(api.body, { error: 'Такого запроса нет' })
})
