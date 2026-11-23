import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { sessionFingerprint } from '../src/infrastructure/session.js'
import { createHost, rawDb, useTestDatabase } from './helpers/db.js'
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

test('служебные адреса, защитные заголовки и неизвестные запросы', async (t) => {
  const server = await startServer()
  t.after(() => server.close())
  const { base } = server

  const health = await call(base, '/api/health')
  assert.equal(health.status, 200)
  assert.deepEqual(health.body, { ok: true })
  assert.equal(health.headers.get('x-powered-by'), null)
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(health.headers.get('x-frame-options'), 'DENY')
  assert.equal(health.headers.get('referrer-policy'), 'strict-origin-when-cross-origin')
  assert.equal(health.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()')

  const anonNetwork = await call(base, '/api/network')
  assert.equal(anonNetwork.status, 401)
  assert.deepEqual(anonNetwork.body, { error: 'Нужен вход' })

  const rootCookie = await login(base, 'root', 'rootpass')
  const network = await call(base, '/api/network', { cookie: rootCookie })
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

test('вход, профиль, выход, отзыв при смене пароля и cookie сессии', async (t) => {
  const server = await startServer()
  t.after(() => server.close())
  const { base } = server
  const host = await createHost('host', 'secret1')
  const db = await rawDb()
  const hostRow = await db.get('SELECT password_hash FROM users WHERE id = ?', host.id)
  const hostVer = sessionFingerprint(hostRow.password_hash)

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
  assert.match(setCookie, /^session=[\w-]+\.[\w-]+; Max-Age=1209600; Path=\/; Expires=.+; HttpOnly; SameSite=Lax$/)
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
  assert.deepEqual((await call(base, '/api/me', { cookie: forgeSession({ userId: host.id, exp: Date.now() - 1000, ver: hostVer }) })).body, { ok: false })
  assert.deepEqual((await call(base, '/api/me', { cookie: forgeSession({ userId: host.id, exp: Date.now() + 60000 }) })).body, { ok: false })
  assert.deepEqual((await call(base, '/api/me', { cookie: forgeSession({ userId: host.id, exp: Date.now() + 60000, ver: 'stale-version' }) })).body, { ok: false })
  assert.deepEqual((await call(base, '/api/me', { cookie: forgeSession({ userId: 'nobody', exp: Date.now() + 60000, ver: hostVer }) })).body, { ok: false })
  assert.equal((await call(base, '/api/me', { cookie: forgeSession({ userId: host.id, exp: Date.now() + 60000, ver: hostVer }) })).body.login, 'host')

  const logout = await call(base, '/api/logout', { method: 'POST', cookie })
  assert.equal(logout.status, 200)
  assert.deepEqual(logout.body, { ok: true })
  assert.equal(logout.headers.get('set-cookie'), 'session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax')

  process.env.COOKIE_SECURE = '1'
  try {
    const secure = await call(base, '/api/login', { method: 'POST', json: { login: 'host', password: 'secret1' } })
    assert.match(secure.headers.get('set-cookie'), /^session=[\w-]+\.[\w-]+; Max-Age=1209600; Path=\/; Expires=.+; HttpOnly; Secure; SameSite=Lax$/)
    assert.equal(secure.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains')
  } finally {
    delete process.env.COOKIE_SECURE
  }

  // Смена пароля немедленно отзывает старые cookie-сессии.
  const rootCookie = await login(base, 'root', 'rootpass')
  const region = (await call(base, '/api/admin/regions', { method: 'POST', cookie: rootCookie, json: { name: 'Северный регион' } })).body
  const admin = (await call(base, '/api/admin/regional-admins', {
    method: 'POST',
    cookie: rootCookie,
    json: { login: 'reg.rotate', password: 'oldpass1', displayName: 'Смена Пароля', regionId: region.id },
  })).body
  const oldCookie = await login(base, 'reg.rotate', 'oldpass1')
  assert.equal((await call(base, '/api/me', { cookie: oldCookie })).body.ok, true)
  assert.equal((await call(base, '/api/admin/dashboard', { cookie: oldCookie })).status, 200)

  const changed = await call(base, `/api/admin/regional-admins/${admin.id}`, {
    method: 'PATCH',
    cookie: rootCookie,
    json: { displayName: 'Смена Пароля', regionId: region.id, password: 'newpass2' },
  })
  assert.equal(changed.status, 200)
  assert.deepEqual((await call(base, '/api/me', { cookie: oldCookie })).body, { ok: false })
  assert.equal((await call(base, '/api/admin/dashboard', { cookie: oldCookie })).status, 401)
  const freshCookie = await login(base, 'reg.rotate', 'newpass2')
  assert.equal((await call(base, '/api/admin/dashboard', { cookie: freshCookie })).status, 200)
})

test('права: без входа 401, чужая роль 403', async (t) => {
  const server = await startServer()
  t.after(() => server.close())
  const { base } = server
  await createHost('host2', 'secret1')
  const hostCookie = await login(base, 'host2', 'secret1')
  const rootCookie = await login(base, 'root', 'rootpass')

  for (const url of ['/api/quizzes', '/api/stats', '/api/results', '/api/template', '/api/admin/dashboard', '/api/lessons', '/api/network']) {
    const anonymous = await call(base, url)
    assert.equal(anonymous.status, 401, url)
    assert.deepEqual(anonymous.body, { error: 'Нужен вход' })
  }
  const ghost = await call(base, '/api/quizzes', { cookie: forgeSession({ userId: 'nobody', exp: Date.now() + 60000, ver: 'x' }) })
  assert.equal(ghost.status, 401)
  assert.deepEqual(ghost.body, { error: 'Нужен вход' })

  for (const url of ['/api/stats', '/api/results']) {
    const denied = await call(base, url, { cookie: rootCookie })
    assert.equal(denied.status, 403, url)
    assert.deepEqual(denied.body, { error: 'Недостаточно прав' })
  }
  for (const url of ['/api/quizzes', '/api/template', '/api/network']) {
    const allowed = await call(base, url, { cookie: rootCookie })
    assert.equal(allowed.status, 200, url)
  }
  assert.equal((await call(base, '/api/network', { cookie: hostCookie })).status, 200)

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
  assert.deepEqual(lessonBody.body, { error: 'Название урока: от 2 до 200 символов' })

  const anonBroken = await call(base, '/api/admin/lessons', {
    method: 'POST',
    body: '{"title":',
    headers: { 'Content-Type': 'application/json' },
  })
  assert.equal(anonBroken.status, 401)
  const anonLarge = await call(base, '/api/admin/lessons', {
    method: 'POST',
    json: { title: 'Длинный урок', pad: 'a'.repeat(300 * 1024) },
  })
  assert.equal(anonLarge.status, 401)
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

test('ограничение неудачных попыток входа: логин отдельно от адреса', async (t) => {
  process.env.TRUST_PROXY = '1'
  let server
  try {
    server = await startServer()
  } finally {
    delete process.env.TRUST_PROXY
  }
  t.after(() => server.close())
  const { base } = server
  await createHost('real.user', 'secret1')

  for (let i = 0; i < 10; i += 1) {
    const attempt = await call(base, '/api/login', {
      method: 'POST',
      headers: { 'X-Forwarded-For': '198.51.100.10' },
      json: { login: 'target.user', password: 'wrong' },
    })
    assert.equal(attempt.status, 401)
  }
  const accountBlocked = await call(base, '/api/login', {
    method: 'POST',
    headers: { 'X-Forwarded-For': '198.51.100.99' },
    json: { login: 'target.user', password: 'wrong' },
  })
  assert.equal(accountBlocked.status, 429)
  const otherLogin = await call(base, '/api/login', {
    method: 'POST',
    headers: { 'X-Forwarded-For': '198.51.100.10' },
    json: { login: 'someone.else', password: 'wrong' },
  })
  assert.equal(otherLogin.status, 401)

  for (let i = 0; i < 120; i += 1) {
    const attempt = await call(base, '/api/login', {
      method: 'POST',
      headers: { 'X-Forwarded-For': '198.51.100.11' },
      json: { login: `spray.${i}`, password: 'wrong' },
    })
    assert.equal(attempt.status, 401, `попытка ${i}`)
  }
  const ipBlocked = await call(base, '/api/login', {
    method: 'POST',
    headers: { 'X-Forwarded-For': '198.51.100.11' },
    json: { login: 'spray.blocked', password: 'wrong' },
  })
  assert.equal(ipBlocked.status, 429)
  const correct = await call(base, '/api/login', {
    method: 'POST',
    headers: { 'X-Forwarded-For': '198.51.100.11' },
    json: { login: 'real.user', password: 'secret1' },
  })
  assert.equal(correct.status, 200)
  const afterReset = await call(base, '/api/login', {
    method: 'POST',
    headers: { 'X-Forwarded-For': '198.51.100.11' },
    json: { login: 'after.reset', password: 'wrong' },
  })
  assert.equal(afterReset.status, 401)
})

test('регистрация директора школы: варианты, автологин, вход и проверки', async (t) => {
  const server = await startServer()
  t.after(() => server.close())
  const { base } = server
  const root = await login(base, 'root', 'rootpass')

  const region = (await call(base, '/api/admin/regions', {
    method: 'POST',
    cookie: root,
    json: { name: 'Алматинская область', nameKk: 'Алматы облысы' },
  })).body
  await call(base, '/api/admin/regional-admins', {
    method: 'POST',
    cookie: root,
    json: { login: 'almaty.reg', password: 'secret1', displayName: 'Серик', regionId: region.id },
  })
  const regCookie = await login(base, 'almaty.reg', 'secret1')
  const district = (await call(base, '/api/admin/districts', {
    method: 'POST',
    cookie: regCookie,
    json: { name: 'Карасайский район', nameKk: 'Қарасай ауданы' },
  })).body
  const school = (await call(base, '/api/admin/organizations', {
    method: 'POST',
    cookie: regCookie,
    json: { name: 'Школа №10', nameKk: '№10 мектеп', districtId: district.id, groups: { grades_5_9: true } },
  })).body

  const options = await call(base, '/api/register/options')
  assert.equal(options.status, 200)
  assert.deepEqual(options.body.roles, [{ id: 'org', label: 'Директор школы' }])
  assert.ok(options.body.regions.some((item) => item.id === region.id))
  assert.ok(options.body.districts.some((item) => item.id === district.id))
  assert.ok(options.body.organizations.some((item) => item.id === school.id))

  const missingEmail = await call(base, '/api/register', {
    method: 'POST',
    json: { role: 'org', organizationId: school.id, firstName: 'Иван', lastName: 'Иванов', password: 'secret1' },
  })
  assert.equal(missingEmail.status, 400)
  assert.equal(missingEmail.body.error, 'Укажите корректную почту')

  const badEmail = await call(base, '/api/register', {
    method: 'POST',
    json: { role: 'org', organizationId: school.id, firstName: 'Иван', lastName: 'Иванов', email: 'bad-email', password: 'secret1' },
  })
  assert.equal(badEmail.status, 400)
  assert.equal(badEmail.body.error, 'Укажите корректную почту')

  const badRole = await call(base, '/api/register', {
    method: 'POST',
    json: { role: 'super', organizationId: school.id, firstName: 'Иван', lastName: 'Иванов', email: 'ivan@school.kz', password: 'secret1' },
  })
  assert.equal(badRole.status, 400)
  assert.equal(badRole.body.error, 'Сейчас доступна регистрация только для роли «Директор школы»')

  const badPass = await call(base, '/api/register', {
    method: 'POST',
    json: { role: 'org', organizationId: school.id, firstName: 'Иван', lastName: 'Иванов', email: 'ivan@school.kz', password: '123' },
  })
  assert.equal(badPass.status, 400)

  const missingOrg = await call(base, '/api/register', {
    method: 'POST',
    json: { role: 'org', organizationId: 'missing', firstName: 'Иван', lastName: 'Иванов', email: 'ivan@school.kz', password: 'secret1' },
  })
  assert.equal(missingOrg.status, 404)

  const first = await call(base, '/api/register', {
    method: 'POST',
    json: { role: 'org', organizationId: school.id, firstName: 'Арман', lastName: 'Сериков', email: 'Arman@School.KZ', password: 'secret1' },
  })
  assert.equal(first.status, 201)
  assert.equal(first.body.ok, true)
  assert.equal(first.body.role, 'org')
  assert.equal(first.body.login, 'arman.serikov')
  assert.equal(first.body.email, 'arman@school.kz')
  assert.equal(first.body.displayName, 'Арман Сериков')

  const cookie = first.headers.get('set-cookie').split(';')[0]
  assert.equal((await call(base, '/api/admin/dashboard', { cookie })).status, 200)
  const me = await call(base, '/api/me', { cookie })
  assert.equal(me.body.organizationId, school.id)
  assert.equal(me.body.email, 'arman@school.kz')

  const loginByEmail = await call(base, '/api/login', {
    method: 'POST',
    json: { login: 'ARMAN@school.kz', password: 'secret1' },
  })
  assert.equal(loginByEmail.status, 200)
  assert.equal(loginByEmail.body.login, 'arman.serikov')

  const dupEmail = await call(base, '/api/register', {
    method: 'POST',
    json: { role: 'org', organizationId: school.id, firstName: 'Другой', lastName: 'Директор', email: 'arman@SCHOOL.kz', password: 'secret2' },
  })
  assert.equal(dupEmail.status, 409)
  assert.equal(dupEmail.body.error, 'Эта почта уже зарегистрирована')

  const second = await call(base, '/api/register', {
    method: 'POST',
    json: { role: 'org', organizationId: school.id, firstName: 'Арман', lastName: 'Сериков', email: 'arman2@school.kz', password: 'secret2' },
  })
  assert.equal(second.status, 201)
  assert.equal(second.body.login, 'arman.serikov2')
})
