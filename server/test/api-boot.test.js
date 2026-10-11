import assert from 'node:assert/strict'
import test from 'node:test'
import { useTestDatabase } from './helpers/db.js'
import { call, startServer } from './helpers/http.js'

await useTestDatabase('api-boot')
process.env.SUPER_LOGIN = 'root'
process.env.SUPER_PASSWORD = '123'

test('неверный пароль суперглавного в окружении: API отвечает 500, а не текстом проверки', async (t) => {
  const server = await startServer()
  t.after(() => server.close())
  for (const url of ['/api/me', '/api/health']) {
    const response = await call(server.base, url)
    assert.equal(response.status, 500, url)
    assert.deepEqual(response.body, { error: 'Ошибка сервера' })
  }
})
