import assert from 'node:assert/strict'
import test from 'node:test'
import { createHost, useTestDatabase } from './helpers/db.js'
import { call, login, startServer } from './helpers/http.js'

await useTestDatabase('realtime')
process.env.SESSION_SECRET = 'test-secret'

const { io } = await import('socket.io-client')
const { setTimeout: realSetTimeout, clearTimeout: realClearTimeout } = globalThis

function connect(base) {
  return io(base, { transports: ['websocket'], forceNew: true })
}

function emit(socket, event, payload) {
  return new Promise((resolve) => {
    if (payload === undefined) socket.emit(event, resolve)
    else socket.emit(event, payload, resolve)
  })
}

function nextSync(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timer = realSetTimeout(() => {
      socket.off('sync', onSync)
      reject(new Error('нет нужного состояния комнаты'))
    }, 3000)
    function onSync(state) {
      if (!predicate(state)) return
      realClearTimeout(timer)
      socket.off('sync', onSync)
      resolve(state)
    }
    socket.on('sync', onSync)
  })
}

test('realtime: ошибки событий, подтверждения, пуш после REST и отключение игрока', async (t) => {
  const server = await startServer()
  const sockets = []
  t.after(async () => {
    for (const socket of sockets) socket.disconnect()
    await server.close()
  })
  const { base } = server
  await createHost('host', 'secret1')
  const cookie = await login(base, 'host', 'secret1')
  const quiz = (await call(base, '/api/quizzes', {
    method: 'POST',
    cookie,
    json: { title: 'Сокеты', questions: [{ text: 'Да или нет?', timeLimit: 10, correctIndex: 0, options: [{ text: 'Да' }, { text: 'Нет' }] }] },
  })).body
  const { code, hostToken } = (await call(base, '/api/rooms', { method: 'POST', cookie, json: { quizId: quiz.id } })).body

  const stranger = connect(base)
  sockets.push(stranger)
  assert.deepEqual(await emit(stranger, 'host:join', { code, hostToken: 'wrong' }), { error: 'Комната не найдена или сессия ведущего устарела' })
  assert.deepEqual(await emit(stranger, 'host:join', {}), { error: 'Комната не найдена или сессия ведущего устарела' })
  assert.deepEqual(await emit(stranger, 'player:join', { code: '000000', name: 'Гость', playerToken: 'player-token-stranger01' }), { error: 'Комната не найдена' })
  assert.deepEqual(await emit(stranger, 'player:join', { code, name: 'Я', playerToken: 'player-token-stranger01' }), { error: 'Имя от 2 до 20 символов' })
  assert.deepEqual(await emit(stranger, 'host:advance'), { error: 'Нет доступа' })
  assert.deepEqual(await emit(stranger, 'player:answer', { optionIndex: 0 }), { error: 'Вы не в комнате' })

  const host = connect(base)
  sockets.push(host)
  const hostLobby = nextSync(host, (state) => state.status === 'lobby')
  assert.deepEqual(await emit(host, 'host:join', { code, hostToken }), { ok: true })
  const lobby = await hostLobby
  assert.equal(lobby.role, 'host')
  assert.deepEqual(lobby.players, [])

  const player = connect(base)
  sockets.push(player)
  const hostSeesAnya = nextSync(host, (state) => state.players.some((item) => item.name === 'Аня' && item.online))
  const playerLobby = nextSync(player, (state) => state.me?.name === 'Аня')
  assert.deepEqual(await emit(player, 'player:join', { code, name: ' Аня ', playerToken: 'player-token-anya-0001' }), { ok: true, name: 'Аня' })
  const mine = await playerLobby
  assert.equal(mine.role, 'player')
  assert.deepEqual(mine.me, { name: 'Аня', score: 0, answered: false, answerIndex: null, lastPoints: null, lastCorrect: null, rank: 1 })
  await hostSeesAnya

  const hostSeesOffline = nextSync(host, (state) => state.players.some((item) => item.name === 'Аня' && !item.online))
  player.disconnect()
  await hostSeesOffline

  const back = connect(base)
  sockets.push(back)
  const hostSeesOnline = nextSync(host, (state) => state.players.some((item) => item.name === 'Аня' && item.online))
  assert.deepEqual(await emit(back, 'player:join', { code, name: 'Другое', playerToken: 'player-token-anya-0001' }), { ok: true, name: 'Аня' })
  await hostSeesOnline

  const hostSeesBorya = nextSync(host, (state) => state.playerCount === 2)
  await call(base, `/api/rooms/${code}/join`, { method: 'POST', json: { name: 'Боря', playerToken: 'player-token-borya-0001' } })
  const both = await hostSeesBorya
  assert.deepEqual(both.players.map((item) => [item.name, item.online]), [['Аня', true], ['Боря', true]])

  const restAdvance = nextSync(back, (state) => state.status === 'question')
  await call(base, `/api/rooms/${code}/advance`, { method: 'POST', json: { hostToken } })
  const question = await restAdvance
  assert.equal(question.question.correctIndex, undefined)
  assert.equal(question.me.answered, false)

  const restAnswer = nextSync(host, (state) => state.answeredCount === 1)
  await call(base, `/api/rooms/${code}/answer`, { method: 'POST', json: { playerToken: 'player-token-borya-0001', optionIndex: 1 } })
  assert.deepEqual((await restAnswer).players.map((item) => item.answered), [false, true])

  const answered = await emit(back, 'player:answer', { optionIndex: 0 })
  assert.equal(answered.ok, true)
  assert.deepEqual(await emit(back, 'player:answer', { optionIndex: 1 }), { error: 'Ответ уже принят' })
  assert.deepEqual(await emit(host, 'player:answer', { optionIndex: 1 }), { error: 'Вы не в комнате' })
  assert.deepEqual(await emit(back, 'host:advance'), { error: 'Нет доступа' })

  const hostReveal = nextSync(host, (state) => state.status === 'reveal')
  assert.deepEqual(await emit(host, 'host:advance'), { ok: true, status: 'reveal' })
  const reveal = await hostReveal
  assert.deepEqual(reveal.question.optionCounts, [1, 1])
  const podium = nextSync(back, (state) => state.status === 'podium')
  assert.deepEqual(await emit(host, 'host:advance'), { ok: true, status: 'podium' })
  assert.equal((await podium).me.rank, 1)
  assert.deepEqual(await emit(host, 'host:advance'), { error: 'Сейчас это действие недоступно' })
})

test('realtime: вопрос закрывается по таймеру и состояние уходит всем', async (t) => {
  const server = await startServer()
  const sockets = []
  t.after(async () => {
    for (const socket of sockets) socket.disconnect()
    await server.close()
  })
  const { base } = server
  await createHost('timer', 'secret1')
  const cookie = await login(base, 'timer', 'secret1')
  const quiz = (await call(base, '/api/quizzes', {
    method: 'POST',
    cookie,
    json: { title: 'Таймер', questions: [{ text: 'Успеешь?', timeLimit: 10, correctIndex: 1, options: [{ text: 'Нет' }, { text: 'Да' }] }] },
  })).body
  const { code, hostToken } = (await call(base, '/api/rooms', { method: 'POST', cookie, json: { quizId: quiz.id } })).body

  const host = connect(base)
  const player = connect(base)
  sockets.push(host, player)
  assert.deepEqual(await emit(host, 'host:join', { code, hostToken }), { ok: true })
  assert.deepEqual(await emit(player, 'player:join', { code, name: 'Аня', playerToken: 'player-token-anya-0001' }), { ok: true, name: 'Аня' })

  const opened = nextSync(player, (state) => state.status === 'question')
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let ack
  try {
    ack = await emit(host, 'host:advance')
    await opened
    const playerReveal = nextSync(player, (state) => state.status === 'reveal')
    const hostReveal = nextSync(host, (state) => state.status === 'reveal')
    t.mock.timers.tick(10_000)
    const [mine, hosts] = await Promise.all([playerReveal, hostReveal])
    assert.equal(mine.question.correctIndex, 1)
    assert.deepEqual(mine.me, { name: 'Аня', score: 0, answered: false, answerIndex: null, lastPoints: 0, lastCorrect: false, rank: 1 })
    assert.deepEqual(hosts.question.optionCounts, [0, 0])
  } finally {
    t.mock.timers.reset()
  }
  assert.deepEqual(ack, { ok: true, status: 'question' })
})
