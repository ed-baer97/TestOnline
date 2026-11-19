import assert from 'node:assert/strict'
import test from 'node:test'
import { createHost, useTestDatabase } from './helpers/db.js'

await useTestDatabase('super-admin')
process.env.SESSION_SECRET = 'test-secret'
process.env.SUPER_LOGIN = 'root'
process.env.SUPER_PASSWORD = 'rootpass'

test('суперглавный не создаётся, если его логин уже занят', async () => {
  await createHost('root', 'secret1')
  const { ensureSuperAdmin } = await import('../src/services/accounts.js')
  await assert.rejects(
    () => ensureSuperAdmin(),
    (error) => error.status === 500 && error.message.includes('уже занят'),
  )
})
