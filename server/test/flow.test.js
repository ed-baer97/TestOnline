import assert from 'node:assert/strict'
import test from 'node:test'
import { useTestDatabase } from './helpers/db.js'

await useTestDatabase('flow')
process.env.ADMIN_PASSWORD = 'admin'
process.env.SESSION_SECRET = 'test-secret'

test('комната: QR-вход, вопрос без правильного ответа, очки и подиум', async () => {
  const { createApp } = await import('../src/index.js')
  const { io } = await import('socket.io-client')
  const { httpServer, io: serverIo } = createApp()
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const port = httpServer.address().port
  const base = `http://127.0.0.1:${port}`

  const { registerUser } = await import('../src/db.js')
  await registerUser({ login: 'host', password: 'secret1' })
  await assert.rejects(() => registerUser({ login: 'host', password: 'secret1' }), (error) => error.status === 409)
  const session = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'host', password: 'secret1' }),
  })
  assert.equal(session.status, 200)
  const cookie = session.headers.get('set-cookie').split(';')[0]

  const badLogin = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'host', password: 'wrong-password' }),
  })
  assert.equal(badLogin.status, 401)

  const created = await fetch(`${base}/api/quizzes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      title: 'Проверка комнаты',
      questions: [{
        text: '2 + 2?',
        timeLimit: 30,
        correctIndex: 0,
        options: [{ text: '4' }, { text: '5' }, { text: '3' }, { text: '22' }],
      }],
    }),
  })
  assert.equal(created.status, 201)
  const quiz = await created.json()

  const denied = await fetch(`${base}/api/quizzes`)
  assert.equal(denied.status, 401)

  const roomRes = await fetch(`${base}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ quizId: quiz.id }),
  })
  assert.equal(roomRes.status, 201)
  const room = await roomRes.json()
  assert.match(room.code, /^\d{6}$/)

  const info = await fetch(`${base}/api/rooms/${room.code}`)
  const infoJson = await info.json()
  assert.equal(infoJson.joinable, true)
  assert.equal(infoJson.question, undefined)

  const host = io(base, { transports: ['websocket'] })
  const player = io(base, { transports: ['websocket'] })
  const waitSync = (socket, predicate) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('нет нужного состояния комнаты')), 3000)
    const onSync = (state) => {
      if (!predicate(state)) return
      clearTimeout(timer)
      socket.off('sync', onSync)
      resolve(state)
    }
    socket.on('sync', onSync)
  })

  const hostReady = waitSync(host, (state) => state.status === 'lobby')
  await new Promise((resolve, reject) => {
    host.emit('host:join', { code: room.code, hostToken: room.hostToken }, (res) => {
      if (res?.error) reject(new Error(res.error))
      else resolve(res)
    })
  })
  await hostReady

  const playerReady = waitSync(player, (state) => state.me?.name === 'Аня')
  await new Promise((resolve, reject) => {
    player.emit('player:join', {
      code: room.code,
      name: 'Аня',
      playerToken: 'player-token-anya-0001',
    }, (res) => {
      if (res?.error) reject(new Error(res.error))
      else resolve(res)
    })
  })
  const lobby = await playerReady
  assert.equal(lobby.playerCount, 1)

  const questionWait = waitSync(player, (state) => state.status === 'question')
  host.emit('host:advance')
  const question = await questionWait
  assert.equal(question.role, 'player')
  assert.equal(question.question.correctIndex, undefined)
  assert.equal(question.question.options.length, 4)

  const revealWait = waitSync(player, (state) => state.status === 'reveal')
  const answer = await new Promise((resolve) => {
    player.emit('player:answer', { optionIndex: 0 }, resolve)
  })
  assert.equal(answer.ok, true)
  assert.ok(answer.points >= 900)

  const duplicate = await new Promise((resolve) => {
    player.emit('player:answer', { optionIndex: 1 }, resolve)
  })
  assert.equal(duplicate.error, 'Ответ уже принят')

  host.emit('host:advance')
  const reveal = await revealWait
  assert.equal(reveal.question.correctIndex, 0)
  assert.equal(reveal.me.lastCorrect, true)
  assert.ok(reveal.me.score >= 900)

  const podiumWait = waitSync(host, (state) => state.status === 'podium')
  host.emit('host:advance')
  const podium = await podiumWait
  assert.equal(podium.leaderboard[0].name, 'Аня')
  assert.equal(podium.question, null)

  const results = await fetch(`${base}/api/results`, { headers: { Cookie: cookie } })
  const resultsJson = await results.json()
  assert.equal(resultsJson.results[0].title, 'Проверка комнаты')

  const stats = await fetch(`${base}/api/quizzes/${quiz.id}/stats`, { headers: { Cookie: cookie } })
  const statsJson = await stats.json()
  assert.equal(statsJson.runs, 1)
  assert.equal(statsJson.sessions[0].players[0].name, 'Аня')
  assert.equal(statsJson.sessions[0].players[0].answers[0].ok, true)
  assert.equal(statsJson.sessions[0].players[0].answers[0].chosen, '4')
  assert.equal(Number.isNaN(Date.parse(statsJson.sessions[0].startedAt)), false)

  const overview = await fetch(`${base}/api/stats`, { headers: { Cookie: cookie } })
  const overviewJson = await overview.json()
  assert.equal(overviewJson.runs, 1)
  assert.equal(overviewJson.participants, 1)

  await registerUser({ login: 'other', password: 'secret2' })
  const other = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'other', password: 'secret2' }),
  })
  assert.equal(other.status, 200)
  const otherCookie = other.headers.get('set-cookie').split(';')[0]
  const hidden = await fetch(`${base}/api/quizzes/${quiz.id}`, { headers: { Cookie: otherCookie } })
  assert.equal(hidden.status, 404)

  player.disconnect()
  host.disconnect()
  serverIo.close()
  await new Promise((resolve) => httpServer.close(resolve))
})
