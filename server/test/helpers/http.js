import assert from 'node:assert/strict'

export async function startServer() {
  const { createApp } = await import('../../src/index.js')
  const runtime = createApp()
  await new Promise((resolve) => runtime.httpServer.listen(0, '127.0.0.1', resolve))
  return {
    ...runtime,
    base: `http://127.0.0.1:${runtime.httpServer.address().port}`,
    async close() {
      runtime.io.close()
      await new Promise((resolve) => runtime.httpServer.close(() => resolve()))
    },
  }
}

export async function call(base, path, { method = 'GET', json, body, cookie, headers = {} } = {}) {
  const init = { method, headers: { ...headers } }
  if (cookie) init.headers.Cookie = cookie
  if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(json)
  } else if (body !== undefined) {
    init.body = body
  }
  const response = await fetch(`${base}${path}`, init)
  const buffer = Buffer.from(await response.arrayBuffer())
  const text = buffer.toString()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = null
  }
  return { status: response.status, headers: response.headers, body: data, text, buffer }
}

export async function login(base, loginName, password) {
  const response = await call(base, '/api/login', { method: 'POST', json: { login: loginName, password } })
  assert.equal(response.status, 200, `вход ${loginName}: ${response.text}`)
  return response.headers.get('set-cookie').split(';')[0]
}
