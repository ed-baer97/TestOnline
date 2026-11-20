import assert from 'node:assert/strict'
import test from 'node:test'
import { io } from 'socket.io-client'
import { evictRoom, flushRooms, getRoom, scheduleRemember } from '../src/services/rooms/index.js'
import { createHost, rawDb, useTestDatabase } from './helpers/db.js'
import { call, login, startServer } from './helpers/http.js'

await useTestDatabase('api-rooms')
process.env.SESSION_SECRET = 'test-secret'
process.env.SUPER_LOGIN = 'root'
process.env.SUPER_PASSWORD = 'rootpass'

const twoQuestions = {
  title: 'Комната по REST',
  questions: [
    { text: '2 + 2?', timeLimit: 60, correctIndex: 0, options: [{ text: '4' }, { text: '5' }, { text: '3' }] },
    { text: 'Цвет неба?', timeLimit: 60, correctIndex: 0, options: [{ text: 'Синий' }, { text: 'Зелёный' }] },
  ],
}

async function setup(base, loginName) {
  await createHost(loginName, 'secret1')
  const cookie = await login(base, loginName, 'secret1')
  const quiz = (await call(base, '/api/quizzes', { method: 'POST', cookie, json: twoQuestions })).body
  const room = (await call(base, '/api/rooms', { method: 'POST', cookie, json: { quizId: quiz.id } })).body
  return { cookie, quiz, room }
}

function token(n) {
  return `player-token-${String(n).padStart(7, '0')}`
}

async function readPayload(code) {
  const db = await rawDb()
  const row = await db.get('SELECT payload FROM live_rooms WHERE code = ?', code)
  return row ? JSON.parse(row.payload) : null
}

async function writePayload(code, patch) {
  const db = await rawDb()
  const payload = { ...(await readPayload(code)), ...patch }
  await db.run('UPDATE live_rooms SET payload = ? WHERE code = ?', JSON.stringify(payload), code)
}

test('комната по REST: лобби, вход, ответы, раскрытие и итог', async (t) => {
  const server = await startServer()
  t.after(() => server.close())
  const { base } = server
  await createHost('host', 'secret1')
  const cookie = await login(base, 'host', 'secret1')
  const quiz = (await call(base, '/api/quizzes', { method: 'POST', cookie, json: twoQuestions })).body

  const noQuiz = await call(base, '/api/rooms', { method: 'POST', cookie, json: { quizId: 'missing' } })
  assert.equal(noQuiz.status, 404)
  assert.deepEqual(noQuiz.body, { error: 'Квиз не найден' })
  assert.equal((await call(base, '/api/rooms', { method: 'POST', json: { quizId: quiz.id } })).status, 401)

  const created = await call(base, '/api/rooms', { method: 'POST', cookie, json: { quizId: quiz.id } })
  assert.equal(created.status, 201)
  assert.deepEqual(Object.keys(created.body), ['code', 'hostToken', 'title', 'access'])
  assert.match(created.body.code, /^\d{6}$/)
  assert.match(created.body.hostToken, /^[\w-]{32}$/)
  assert.equal(created.body.title, 'Комната по REST')
  assert.equal(created.body.access, 'public')
  const { code, hostToken } = created.body

  assert.deepEqual((await call(base, `/api/rooms/${code}`)).body, { code, title: 'Комната по REST', status: 'lobby', playerCount: 0, joinable: true, access: 'public' })
  const noRoom = await call(base, '/api/rooms/000000')
  assert.equal(noRoom.status, 404)
  assert.deepEqual(noRoom.body, { error: 'Комната не найдена' })

  for (const suffix of ['/host?token=wrong', '/host']) {
    const denied = await call(base, `/api/rooms/${code}${suffix}`)
    assert.equal(denied.status, 404)
    assert.deepEqual(denied.body, { error: 'Комната не найдена' })
  }
  const lobby = await call(base, `/api/rooms/${code}/host?token=${hostToken}`)
  assert.equal(lobby.status, 200)
  assert.equal(typeof lobby.body.serverNow, 'number')
  assert.deepEqual({ ...lobby.body, serverNow: 0 }, {
    code,
    title: 'Комната по REST',
    status: 'lobby',
    questionIndex: -1,
    questionCount: 2,
    endsAt: null,
    serverNow: 0,
    playerCount: 0,
    answeredCount: 0,
    role: 'host',
    players: [],
    question: null,
    leaderboard: [],
    access: 'public',
    organizationName: '',
    organizationNameKk: '',
    classLabel: '',
  })

  const joinErrors = [
    [{ name: 'Аня', playerToken: 'short' }, 'Не удалось войти в комнату'],
    [{ name: 'Аня', playerToken: 'bad token with spaces 123' }, 'Не удалось войти в комнату'],
    [{ name: 'А', playerToken: token(1) }, 'Имя от 2 до 20 символов'],
    [{ name: 'x'.repeat(21), playerToken: token(1) }, 'Имя от 2 до 20 символов'],
  ]
  for (const [body, message] of joinErrors) {
    const response = await call(base, `/api/rooms/${code}/join`, { method: 'POST', json: body })
    assert.equal(response.status, 400, message)
    assert.deepEqual(response.body, { error: message })
  }
  assert.equal((await call(base, '/api/rooms/000000/join', { method: 'POST', json: { name: 'Аня', playerToken: token(1) } })).status, 404)

  const anya = await call(base, `/api/rooms/${code}/join`, { method: 'POST', json: { name: '  Аня  ', playerToken: token(1) } })
  assert.equal(anya.status, 200)
  assert.deepEqual({ ...anya.body, serverNow: 0 }, {
    code,
    title: 'Комната по REST',
    status: 'lobby',
    questionIndex: -1,
    questionCount: 2,
    endsAt: null,
    serverNow: 0,
    playerCount: 1,
    answeredCount: 0,
    role: 'player',
    me: { name: 'Аня', score: 0, answered: false, answerIndex: null, lastPoints: null, lastCorrect: null, rank: 1 },
    question: null,
    leaderboard: [{ name: 'Аня', score: 0, rank: 1 }],
  })
  const again = await call(base, `/api/rooms/${code}/join`, { method: 'POST', json: { name: 'Другое имя', playerToken: token(1) } })
  assert.equal(again.body.me.name, 'Аня')
  assert.equal(again.body.playerCount, 1)
  const taken = await call(base, `/api/rooms/${code}/join`, { method: 'POST', json: { name: 'аня', playerToken: token(2) } })
  assert.equal(taken.status, 400)
  assert.deepEqual(taken.body, { error: 'Такое имя уже занято' })
  const borya = await call(base, `/api/rooms/${code}/join`, { method: 'POST', json: { name: 'Боря', playerToken: token(2) } })
  assert.equal(borya.body.playerCount, 2)
  assert.equal(borya.body.me.rank, 2)

  for (const suffix of ['/play?token=unknown-token-0000000001', '/play']) {
    const response = await call(base, `/api/rooms/${code}${suffix}`)
    assert.equal(response.status, 404)
    assert.deepEqual(response.body, { error: 'Вы не в комнате' })
  }
  assert.equal((await call(base, `/api/rooms/${code}/play?token=${token(1)}`)).body.me.name, 'Аня')

  const hostLobby = (await call(base, `/api/rooms/${code}/host?token=${hostToken}`)).body
  assert.deepEqual(hostLobby.players.map(({ id, ...player }) => player), [
    { name: 'Аня', score: 0, online: true, answered: false },
    { name: 'Боря', score: 0, online: true, answered: false },
  ])
  assert.deepEqual(hostLobby.leaderboard, [{ name: 'Аня', score: 0, rank: 1 }, { name: 'Боря', score: 0, rank: 2 }])

  const early = await call(base, `/api/rooms/${code}/answer`, { method: 'POST', json: { playerToken: token(1), optionIndex: 0 } })
  assert.equal(early.status, 400)
  assert.deepEqual(early.body, { error: 'Сейчас нельзя отвечать' })
  const stranger = await call(base, `/api/rooms/${code}/answer`, { method: 'POST', json: { playerToken: token(9), optionIndex: 0 } })
  assert.equal(stranger.status, 404)
  assert.deepEqual(stranger.body, { error: 'Вы не в комнате' })
  assert.equal((await call(base, '/api/rooms/000000/answer', { method: 'POST', json: { playerToken: token(1), optionIndex: 0 } })).status, 404)

  const wrongHost = await call(base, `/api/rooms/${code}/advance`, { method: 'POST', json: { hostToken: 'wrong' } })
  assert.equal(wrongHost.status, 404)
  assert.deepEqual(wrongHost.body, { error: 'Комната не найдена' })

  const started = await call(base, `/api/rooms/${code}/advance`, { method: 'POST', json: { hostToken } })
  assert.equal(started.status, 200)
  assert.equal(started.body.status, 'question')
  assert.equal(started.body.questionIndex, 0)
  assert.ok(started.body.endsAt > started.body.serverNow + 55000)
  assert.deepEqual(started.body.question, { text: '2 + 2?', timeLimit: 60, options: [{ index: 0, text: '4' }, { index: 1, text: '5' }, { index: 2, text: '3' }] })
  assert.equal('optionCounts' in started.body.question, false)

  const late = await call(base, `/api/rooms/${code}/join`, { method: 'POST', json: { name: 'Вера', playerToken: token(3) } })
  assert.equal(late.status, 400)
  assert.deepEqual(late.body, { error: 'Игра уже началась' })
  assert.equal((await call(base, `/api/rooms/${code}/join`, { method: 'POST', json: { name: 'Аня', playerToken: token(1) } })).status, 200)
  assert.deepEqual((await call(base, `/api/rooms/${code}`)).body, { code, title: 'Комната по REST', status: 'question', playerCount: 2, joinable: false, access: 'public' })

  const playQuestion = (await call(base, `/api/rooms/${code}/play?token=${token(1)}`)).body
  assert.deepEqual(playQuestion.question, started.body.question)
  assert.deepEqual(playQuestion.me, { name: 'Аня', score: 0, answered: false, answerIndex: null, lastPoints: null, lastCorrect: null, rank: 1 })
  assert.equal(playQuestion.endsAt, started.body.endsAt)

  for (const optionIndex of [5, -1, 'x', 1.5]) {
    const response = await call(base, `/api/rooms/${code}/answer`, { method: 'POST', json: { playerToken: token(1), optionIndex } })
    assert.equal(response.status, 400, String(optionIndex))
    assert.deepEqual(response.body, { error: 'Нет такого варианта' })
  }
  const answered = await call(base, `/api/rooms/${code}/answer`, { method: 'POST', json: { playerToken: token(1), optionIndex: 0 } })
  assert.equal(answered.status, 200)
  assert.deepEqual(Object.keys(answered.body), ['ok', 'points'])
  assert.equal(answered.body.ok, true)
  assert.ok(answered.body.points >= 990 && answered.body.points <= 1000)
  const points = answered.body.points
  const duplicate = await call(base, `/api/rooms/${code}/answer`, { method: 'POST', json: { playerToken: token(1), optionIndex: 1 } })
  assert.equal(duplicate.status, 400)
  assert.deepEqual(duplicate.body, { error: 'Ответ уже принят' })

  const afterAnswer = (await call(base, `/api/rooms/${code}/play?token=${token(1)}`)).body
  assert.deepEqual(afterAnswer.me, { name: 'Аня', score: points, answered: true, answerIndex: 0, lastPoints: null, lastCorrect: null, rank: 1 })
  const hostQuestion = (await call(base, `/api/rooms/${code}/host?token=${hostToken}`)).body
  assert.equal(hostQuestion.answeredCount, 1)
  assert.deepEqual(hostQuestion.players.map((player) => [player.name, player.answered, player.score]), [['Аня', true, points], ['Боря', false, 0]])

  const reveal = await call(base, `/api/rooms/${code}/advance`, { method: 'POST', json: { hostToken } })
  assert.equal(reveal.body.status, 'reveal')
  assert.equal(reveal.body.endsAt, null)
  assert.deepEqual(reveal.body.question, { ...started.body.question, correctIndex: 0, optionCounts: [1, 0, 0] })
  assert.deepEqual(reveal.body.leaderboard, [{ name: 'Аня', score: points, rank: 1 }, { name: 'Боря', score: 0, rank: 2 }])
  const boryaReveal = (await call(base, `/api/rooms/${code}/play?token=${token(2)}`)).body
  assert.deepEqual(boryaReveal.me, { name: 'Боря', score: 0, answered: false, answerIndex: null, lastPoints: 0, lastCorrect: false, rank: 2 })
  assert.equal(boryaReveal.question.correctIndex, 0)
  assert.equal('optionCounts' in boryaReveal.question, false)
  const anyaReveal = (await call(base, `/api/rooms/${code}/play?token=${token(1)}`)).body
  assert.deepEqual(anyaReveal.me, { name: 'Аня', score: points, answered: true, answerIndex: 0, lastPoints: points, lastCorrect: true, rank: 1 })
  const closed = await call(base, `/api/rooms/${code}/answer`, { method: 'POST', json: { playerToken: token(2), optionIndex: 0 } })
  assert.deepEqual(closed.body, { error: 'Сейчас нельзя отвечать' })

  const second = (await call(base, `/api/rooms/${code}/advance`, { method: 'POST', json: { hostToken } })).body
  assert.equal(second.status, 'question')
  assert.equal(second.questionIndex, 1)
  assert.equal(second.answeredCount, 0)
  assert.deepEqual(second.players.map((player) => player.answered), [false, false])
  const wrongAnswer = await call(base, `/api/rooms/${code}/answer`, { method: 'POST', json: { playerToken: token(2), optionIndex: '1' } })
  assert.deepEqual(wrongAnswer.body, { ok: true, points: 0 })
  assert.equal((await call(base, `/api/rooms/${code}/advance`, { method: 'POST', json: { hostToken } })).body.question.optionCounts.join(), '0,1')

  const podium = (await call(base, `/api/rooms/${code}/advance`, { method: 'POST', json: { hostToken } })).body
  assert.equal(podium.status, 'podium')
  assert.equal(podium.question, null)
  assert.equal(podium.endsAt, null)
  assert.equal(podium.questionIndex, 1)
  const finished = await call(base, `/api/rooms/${code}/advance`, { method: 'POST', json: { hostToken } })
  assert.equal(finished.status, 400)
  assert.deepEqual(finished.body, { error: 'Сейчас это действие недоступно' })
  const anyaPodium = (await call(base, `/api/rooms/${code}/play?token=${token(1)}`)).body
  assert.deepEqual(anyaPodium.me, { name: 'Аня', score: points, answered: false, answerIndex: null, lastPoints: 0, lastCorrect: false, rank: 1 })
  assert.equal(anyaPodium.question, null)
  assert.deepEqual((await call(base, `/api/rooms/${code}`)).body, { code, title: 'Комната по REST', status: 'podium', playerCount: 2, joinable: false, access: 'public' })

  const results = (await call(base, '/api/results', { cookie })).body.results
  assert.equal(results.length, 1)
  assert.deepEqual(Object.keys(results[0]), ['title', 'code', 'players', 'finishedAt'])
  assert.equal(results[0].code, code)
  assert.deepEqual(results[0].players.map(({ answers, ...player }) => player), [
    { name: 'Аня', userId: null, score: points, rank: 1 },
    { name: 'Боря', userId: null, score: 0, rank: 2 },
  ])
  assert.deepEqual(results[0].players[0].answers.map(({ questionId, ...answer }) => answer), [
    { question: '2 + 2?', chosen: '4', correct: '4', ok: true, points },
    { question: 'Цвет неба?', chosen: null, correct: 'Синий', ok: false, points: 0 },
  ])
  assert.deepEqual(results[0].players[1].answers.map(({ questionId, ...answer }) => answer), [
    { question: '2 + 2?', chosen: null, correct: '4', ok: false, points: 0 },
    { question: 'Цвет неба?', chosen: 'Зелёный', correct: 'Синий', ok: false, points: 0 },
  ])
  assert.deepEqual(results[0].players[0].answers.map((answer) => answer.questionId), quiz.questions.map((question) => question.id))

  const stats = (await call(base, `/api/quizzes/${quiz.id}/stats`, { cookie })).body
  assert.equal(stats.runs, 1)
  assert.equal(stats.participants, 2)
  assert.equal(stats.averageScore, Math.round(points / 2))
  assert.deepEqual(stats.questions, [
    { text: '2 + 2?', correct: 1, total: 2, rate: 50 },
    { text: 'Цвет неба?', correct: 0, total: 2, rate: 0 },
  ])
  assert.equal(stats.sessions[0].code, code)
  assert.equal(stats.sessions[0].access, 'public')
  assert.equal(stats.sessions[0].topScore, points)
  assert.equal(stats.sessions[0].playerCount, 2)
  assert.deepEqual(stats.sessions[0].players.map((player) => player.rank), [1, 2])
  assert.ok(stats.sessions[0].startedAt <= stats.sessions[0].finishedAt)

  const overview = (await call(base, '/api/stats', { cookie })).body
  assert.equal(overview.runs, 1)
  assert.equal(overview.participants, 2)
  assert.equal(overview.averageScore, Math.round(points / 2))
  assert.deepEqual(overview.byQuiz.map((item) => [item.title, item.runs]), [['Комната по REST', 1], ['Демо: общий кругозор', 0]])
  assert.deepEqual(overview.recent[0].top, { name: 'Аня', score: points })
  assert.deepEqual(Object.keys(overview.recent[0]), ['id', 'quizId', 'title', 'code', 'startedAt', 'finishedAt', 'playerCount', 'averageScore', 'top'])
  assert.deepEqual(overview.history, overview.recent)
})

test('комната хранится в live_rooms: закрытие вопроса по времени и срок жизни', async (t) => {
  const server = await startServer()
  t.after(() => server.close())
  const { base } = server
  const { room } = await setup(base, 'keeper')
  const { code, hostToken } = room

  const stored = await readPayload(code)
  assert.deepEqual(Object.keys(stored), ['code', 'hostToken', 'quiz', 'audience', 'status', 'questionIndex', 'questionStartedAt', 'endsAt', 'saved', 'players', 'createdAt', 'podiumAt', 'startedAt'])
  assert.equal(stored.status, 'lobby')
  assert.equal(stored.hostToken, hostToken)

  await call(base, `/api/rooms/${code}/join`, { method: 'POST', json: { name: 'Аня', playerToken: token(1) } })
  const withPlayer = await readPayload(code)
  assert.deepEqual(Object.keys(withPlayer.players[0]), ['id', 'token', 'userId', 'name', 'score', 'answered', 'answerIndex', 'lastPoints', 'lastCorrect', 'answers', 'online', 'joinedAt'])
  assert.equal(withPlayer.players[0].online, true)

  await call(base, `/api/rooms/${code}/advance`, { method: 'POST', json: { hostToken } })
  await writePayload(code, { endsAt: Date.now() - 1000 })
  evictRoom(code)
  const lazy = (await call(base, `/api/rooms/${code}/host?token=${hostToken}`)).body
  assert.equal(lazy.status, 'reveal')
  assert.equal(lazy.endsAt, null)
  assert.equal((await readPayload(code)).status, 'reveal')
  const timedOut = (await call(base, `/api/rooms/${code}/play?token=${token(1)}`)).body.me
  assert.deepEqual(timedOut, { name: 'Аня', score: 0, answered: false, answerIndex: null, lastPoints: 0, lastCorrect: false, rank: 1 })

  await writePayload(code, { players: [{ ...withPlayer.players[0], name: 'Аня из базы' }] })
  evictRoom(code)
  assert.equal((await call(base, `/api/rooms/${code}/host?token=${hostToken}`)).body.players[0].name, 'Аня из базы')

  await writePayload(code, { createdAt: Date.now() - 5 * 60 * 60 * 1000 })
  evictRoom(code)
  const expired = await call(base, `/api/rooms/${code}`)
  assert.equal(expired.status, 404)
  assert.deepEqual(expired.body, { error: 'Комната не найдена' })
  assert.equal(await readPayload(code), null)

  const second = await setup(base, 'keeper2')
  await writePayload(second.room.code, { status: 'podium', podiumAt: Date.now() - 31 * 60 * 1000 })
  evictRoom(second.room.code)
  assert.equal((await call(base, `/api/rooms/${second.room.code}/host?token=${second.room.hostToken}`)).status, 404)
  assert.equal(await readPayload(second.room.code), null)

  const third = await setup(base, 'keeper3')
  await writePayload(third.room.code, { status: 'podium', podiumAt: Date.now() - 29 * 60 * 1000 })
  evictRoom(third.room.code)
  assert.equal((await call(base, `/api/rooms/${third.room.code}`)).body.status, 'podium')
})

test('остановка сохраняет ответ, который ещё ждал отложенной записи', async (t) => {
  const server = await startServer()
  t.after(() => server.close())
  const { base } = server
  const { room } = await setup(base, 'flush-host')
  const live = getRoom(room.code)
  live.players.set('late', {
    id: 'late',
    token: 'late-token',
    name: 'Поздний',
    score: 7,
    answered: true,
    answerIndex: 0,
    lastPoints: 7,
    lastCorrect: true,
    answers: [],
    online: true,
    joinedAt: Date.now(),
  })
  scheduleRemember(live)
  await flushRooms()
  const stored = await readPayload(room.code)
  assert.equal(stored.players.some((player) => player.name === 'Поздний' && player.score === 7), true)
})

test('optionIndex — целое число или строка из цифр, пустые и логические значения отклоняются', async (t) => {
  const server = await startServer()
  t.after(() => server.close())
  const { base } = server
  const { room } = await setup(base, 'nulls')
  await call(base, `/api/rooms/${room.code}/join`, { method: 'POST', json: { name: 'Аня', playerToken: token(1) } })
  await call(base, `/api/rooms/${room.code}/advance`, { method: 'POST', json: { hostToken: room.hostToken } })
  for (const optionIndex of [null, true, false, '', ' 1', '1.0', [1], undefined]) {
    const response = await call(base, `/api/rooms/${room.code}/answer`, { method: 'POST', json: { playerToken: token(1), optionIndex } })
    assert.equal(response.status, 400, JSON.stringify(optionIndex))
    assert.deepEqual(response.body, { error: 'Нет такого варианта' })
  }
  assert.equal((await call(base, `/api/rooms/${room.code}/play?token=${token(1)}`)).body.me.answered, false)
  const answer = await call(base, `/api/rooms/${room.code}/answer`, { method: 'POST', json: { playerToken: token(1), optionIndex: '1' } })
  assert.equal(answer.body.ok, true)
  assert.equal((await call(base, `/api/rooms/${room.code}/play?token=${token(1)}`)).body.me.answerIndex, 1)
})

test('в комнате не больше 300 участников', async (t) => {
  const server = await startServer()
  t.after(() => server.close())
  const { base } = server
  const { room } = await setup(base, 'crowd')
  for (let n = 1; n <= 300; n += 1) {
    const response = await call(base, `/api/rooms/${room.code}/join`, { method: 'POST', json: { name: `Игрок ${n}`, playerToken: token(n) } })
    assert.equal(response.status, 200, `игрок ${n}`)
  }
  const full = await call(base, `/api/rooms/${room.code}/join`, { method: 'POST', json: { name: 'Лишний', playerToken: token(301) } })
  assert.equal(full.status, 400)
  assert.deepEqual(full.body, { error: 'Комната заполнена' })
  assert.equal((await call(base, `/api/rooms/${room.code}`)).body.playerCount, 300)
})

test('40 одновременных входов и ответов в комнате не теряются', async (t) => {
  const server = await startServer()
  t.after(() => server.close())
  const { base } = server
  const { room } = await setup(base, 'burst')
  const joins = await Promise.all(
    Array.from({ length: 40 }, (_, i) => call(base, `/api/rooms/${room.code}/join`, {
      method: 'POST',
      json: { name: `Участник ${i + 1}`, playerToken: token(i + 1) },
    })),
  )
  assert.ok(joins.every((res) => res.status === 200))
  assert.equal((await call(base, `/api/rooms/${room.code}`)).body.playerCount, 40)

  await call(base, `/api/rooms/${room.code}/advance`, { method: 'POST', json: { hostToken: room.hostToken } })
  const answers = await Promise.all(
    Array.from({ length: 40 }, (_, i) => call(base, `/api/rooms/${room.code}/answer`, {
      method: 'POST',
      json: { playerToken: token(i + 1), optionIndex: i % 3 },
    })),
  )
  assert.ok(answers.every((res) => res.status === 200 && res.body.ok))
  const hostState = (await call(base, `/api/rooms/${room.code}/host?token=${room.hostToken}`)).body
  assert.equal(hostState.playerCount, 40)
  assert.equal(hostState.answeredCount, 40)
})

test('ограничение перебора кодов комнат возвращает 429 после 30 промахов с одного IP', async (t) => {
  process.env.TRUST_PROXY = '1'
  let server
  try {
    server = await startServer()
  } finally {
    delete process.env.TRUST_PROXY
  }
  t.after(() => server.close())
  const { base } = server

  for (let i = 0; i < 30; i += 1) {
    const res = await call(base, `/api/rooms/${String(900000 + i)}`, {
      headers: { 'X-Forwarded-For': '203.0.113.42' },
    })
    assert.equal(res.status, 404)
  }
  const blocked = await call(base, '/api/rooms/999999', {
    headers: { 'X-Forwarded-For': '203.0.113.42' },
  })
  assert.equal(blocked.status, 429)
  assert.deepEqual(blocked.body, { error: 'Слишком много запросов. Попробуйте через минуту' })
})

test('приватные и публичные квизы: запуск по ролям, вход класса, переподключение, отзыв сессии и статистика', async (t) => {
  const server = await startServer()
  const sockets = []
  t.after(async () => {
    for (const socket of sockets) socket.disconnect()
    await server.close()
  })
  const { base } = server

  const rootCookie = await login(base, 'root', 'rootpass')
  await createHost('priv.host', 'secret1')
  const hostCookie = await login(base, 'priv.host', 'secret1')
  const hostQuiz = (await call(base, '/api/quizzes', { method: 'POST', cookie: hostCookie, json: twoQuestions })).body

  // Структура: два региона, две школы, два класса, ученики.
  const regionA = (await call(base, '/api/admin/regions', { method: 'POST', cookie: rootCookie, json: { name: 'Область А', nameKk: 'А облысы' } })).body
  const regionB = (await call(base, '/api/admin/regions', { method: 'POST', cookie: rootCookie, json: { name: 'Область Б' } })).body
  await call(base, '/api/admin/regional-admins', {
    method: 'POST',
    cookie: rootCookie,
    json: { login: 'reg.a', password: 'secret1', displayName: 'Рег А', regionId: regionA.id },
  })
  await call(base, '/api/admin/regional-admins', {
    method: 'POST',
    cookie: rootCookie,
    json: { login: 'reg.b', password: 'secret1', displayName: 'Рег Б', regionId: regionB.id },
  })
  const regACookie = await login(base, 'reg.a', 'secret1')
  const regBCookie = await login(base, 'reg.b', 'secret1')

  const schoolA = (await call(base, '/api/admin/organizations', {
    method: 'POST',
    cookie: regACookie,
    json: { name: 'Школа А', nameKk: 'А мектебі', groups: { grades_5_9: true } },
  })).body
  const schoolB = (await call(base, '/api/admin/organizations', {
    method: 'POST',
    cookie: regBCookie,
    json: { name: 'Школа Б', groups: { grades_5_9: true } },
  })).body

  await call(base, '/api/admin/org-admins', {
    method: 'POST',
    cookie: regACookie,
    json: { login: 'org.a', password: 'secret1', displayName: 'Орг А', organizationId: schoolA.id },
  })
  await call(base, '/api/admin/org-admins', {
    method: 'POST',
    cookie: regBCookie,
    json: { login: 'org.b', password: 'secret1', displayName: 'Орг Б', organizationId: schoolB.id },
  })
  const orgACookie = await login(base, 'org.a', 'secret1')
  const orgBCookie = await login(base, 'org.b', 'secret1')

  const classA1 = (await call(base, '/api/admin/classes', { method: 'POST', cookie: orgACookie, json: { grade: 5, name: '5а' } })).body
  const classA2 = (await call(base, '/api/admin/classes', { method: 'POST', cookie: orgACookie, json: { grade: 5, name: '5б' } })).body
  const classB1 = (await call(base, '/api/admin/classes', { method: 'POST', cookie: orgBCookie, json: { grade: 5, name: '5в' } })).body

  const pupil1 = (await call(base, '/api/admin/learners', {
    method: 'POST',
    cookie: orgACookie,
    json: { login: 'pupil.one', password: 'secret1', displayName: 'Арман Тест', classId: classA1.id },
  })).body
  await call(base, '/api/admin/learners', {
    method: 'POST',
    cookie: orgACookie,
    json: { login: 'pupil.two', password: 'secret1', displayName: 'Дана Тест', classId: classA1.id },
  })
  await call(base, '/api/admin/learners', {
    method: 'POST',
    cookie: orgACookie,
    json: { login: 'pupil.other', password: 'secret1', displayName: 'Аида 5б', classId: classA2.id },
  })
  await call(base, '/api/admin/learners', {
    method: 'POST',
    cookie: orgACookie,
    json: { login: 'pupil.revoked', password: 'secret1', displayName: 'Серик Отзыв', classId: classA1.id },
  })

  const pupil1Cookie = await login(base, 'pupil.one', 'secret1')
  const pupil2Cookie = await login(base, 'pupil.two', 'secret1')
  const otherClassCookie = await login(base, 'pupil.other', 'secret1')
  const revokedCookie = await login(base, 'pupil.revoked', 'secret1')

  // Смена пароля отзывает cookie-сессию, в том числе для приватных комнат.
  const updatedLearner = await call(base, `/api/admin/learners/${pupil1.id}`, { method: 'PATCH', cookie: orgACookie, json: { displayName: 'Арман Тест', classId: classA1.id } })
  assert.equal(updatedLearner.status, 200)
  const listForRevoke = (await call(base, '/api/admin/learners?search=pupil.revoked', { cookie: orgACookie })).body.learners
  await call(base, `/api/admin/learners/${listForRevoke[0].id}`, {
    method: 'PATCH',
    cookie: orgACookie,
    json: { displayName: 'Серик Отзыв', classId: classA1.id, password: 'newpass2' },
  })

  // Квиз платформы (super) и проверка launch-targets / launch-quizzes.
  const superQuiz = (await call(base, '/api/quizzes', {
    method: 'POST',
    cookie: rootCookie,
    json: {
      title: 'Платформенный квиз',
      questions: [{ text: 'Столица Казахстана?', timeLimit: 60, correctIndex: 0, options: [{ text: 'Астана' }, { text: 'Алматы' }] }],
    },
  })).body

  assert.equal((await call(base, '/api/admin/launch-targets', { cookie: hostCookie })).status, 403)
  assert.equal((await call(base, '/api/admin/launch-targets', { cookie: pupil1Cookie })).status, 403)
  assert.equal((await call(base, '/api/admin/launch-quizzes', { cookie: hostCookie })).status, 403)
  assert.equal((await call(base, '/api/admin/launch-quizzes', { cookie: pupil1Cookie })).status, 403)

  const superTargets = await call(base, '/api/admin/launch-targets', { cookie: rootCookie })
  assert.equal(superTargets.status, 200)
  assert.deepEqual(superTargets.body.organizations.map((org) => org.id), [schoolA.id, schoolB.id])
  const regTargets = await call(base, '/api/admin/launch-targets', { cookie: regACookie })
  assert.deepEqual(regTargets.body.organizations.map((org) => org.id), [schoolA.id])
  const orgTargets = await call(base, '/api/admin/launch-targets', { cookie: orgACookie })
  assert.deepEqual(orgTargets.body.organizations.map((org) => org.id), [schoolA.id])

  const launchCatalog = await call(base, '/api/admin/launch-quizzes', { cookie: regACookie })
  assert.equal(launchCatalog.status, 200)
  assert.deepEqual(launchCatalog.body.quizzes.map((q) => q.id), [superQuiz.id])
  assert.equal(launchCatalog.body.quizzes.some((q) => q.id === hostQuiz.id), false)

  // Проверки прав при запуске комнат.
  const hostPrivate = await call(base, '/api/rooms', {
    method: 'POST',
    cookie: hostCookie,
    json: { quizId: hostQuiz.id, mode: 'private', organizationId: schoolA.id, classId: classA1.id },
  })
  assert.equal(hostPrivate.status, 403)

  const regPublic = await call(base, '/api/rooms', {
    method: 'POST',
    cookie: regACookie,
    json: { quizId: superQuiz.id, mode: 'public' },
  })
  assert.equal(regPublic.status, 400)
  assert.deepEqual(regPublic.body, { error: 'Выберите класс' })

  const orgForeign = await call(base, '/api/rooms', {
    method: 'POST',
    cookie: orgACookie,
    json: { quizId: superQuiz.id, mode: 'private', organizationId: schoolB.id, classId: classB1.id },
  })
  assert.equal(orgForeign.status, 400)
  assert.deepEqual(orgForeign.body, { error: 'Выберите организацию' })

  const regHostQuiz = await call(base, '/api/rooms', {
    method: 'POST',
    cookie: regACookie,
    json: { quizId: hostQuiz.id, mode: 'private', organizationId: schoolA.id, classId: classA1.id },
  })
  assert.equal(regHostQuiz.status, 404)

  // Публичный запуск квиза платформы суперглавным.
  const superPublic = await call(base, '/api/rooms', {
    method: 'POST',
    cookie: rootCookie,
    json: { quizId: superQuiz.id, mode: 'public' },
  })
  assert.equal(superPublic.status, 201)
  assert.equal(superPublic.body.access, 'public')
  await call(base, `/api/rooms/${superPublic.body.code}/join`, { method: 'POST', json: { name: 'Гость', playerToken: token(10) } })
  await call(base, `/api/rooms/${superPublic.body.code}/advance`, { method: 'POST', json: { hostToken: superPublic.body.hostToken } })
  await call(base, `/api/rooms/${superPublic.body.code}/answer`, { method: 'POST', json: { playerToken: token(10), optionIndex: 1 } })
  await call(base, `/api/rooms/${superPublic.body.code}/advance`, { method: 'POST', json: { hostToken: superPublic.body.hostToken } })
  await call(base, `/api/rooms/${superPublic.body.code}/advance`, { method: 'POST', json: { hostToken: superPublic.body.hostToken } })

  // Приватный запуск квиза платформы админом организации для classA1.
  const privRoomRes = await call(base, '/api/rooms', {
    method: 'POST',
    cookie: orgACookie,
    json: { quizId: superQuiz.id, mode: 'private', organizationId: schoolA.id, classId: classA1.id },
  })
  assert.equal(privRoomRes.status, 201)
  const privRoom = privRoomRes.body
  assert.equal(privRoom.access, 'private')

  const privInfo = await call(base, `/api/rooms/${privRoom.code}`)
  assert.equal(privInfo.body.access, 'private')
  const privHost = await call(base, `/api/rooms/${privRoom.code}/host?token=${privRoom.hostToken}`)
  assert.equal(privHost.body.access, 'private')
  assert.equal(privHost.body.organizationName, 'Школа А')
  assert.equal(privHost.body.organizationNameKk, 'А мектебі')
  assert.equal(privHost.body.classLabel, '5а · 5 класс')

  // /api/learn/live видит только целевой класс.
  const liveForTarget = await call(base, '/api/learn/live', { cookie: pupil1Cookie })
  assert.equal(liveForTarget.status, 200)
  assert.deepEqual(liveForTarget.body.quizzes.map((item) => item.code), [privRoom.code])
  const liveForOther = await call(base, '/api/learn/live', { cookie: otherClassCookie })
  assert.equal(liveForOther.body.quizzes.length, 0)
  assert.deepEqual((await call(base, '/api/learn/live', { cookie: orgACookie })).body.quizzes, [])

  // Гость, чужой класс и отозванная сессия не допускаются.
  const guestBlocked = await call(base, `/api/rooms/${privRoom.code}/join`, {
    method: 'POST',
    json: { name: 'Гость', playerToken: token(11) },
  })
  assert.equal(guestBlocked.status, 400)
  assert.deepEqual(guestBlocked.body, { error: 'Этот квиз только для выбранного класса. Войдите под своим логином.' })

  const otherClassBlocked = await call(base, `/api/rooms/${privRoom.code}/join`, {
    method: 'POST',
    cookie: otherClassCookie,
    json: { name: 'Аида', playerToken: token(12) },
  })
  assert.equal(otherClassBlocked.status, 400)

  const revokedBlocked = await call(base, `/api/rooms/${privRoom.code}/join`, {
    method: 'POST',
    cookie: revokedCookie,
    json: { name: 'Серик', playerToken: token(13) },
  })
  assert.equal(revokedBlocked.status, 400)

  // Вход ученика 1 по REST — имя берётся из профиля, игнорируя переданное name.
  const restJoin = await call(base, `/api/rooms/${privRoom.code}/join`, {
    method: 'POST',
    cookie: pupil1Cookie,
    json: { name: 'Левое имя', playerToken: token(14) },
  })
  assert.equal(restJoin.status, 200)
  assert.equal(restJoin.body.me.name, 'Арман Тест')

  // Socket.IO: проверка отозванной сессии и вход другого ученика (или переподключение).
  const badSocket = io(base, {
    transports: ['websocket'],
    forceNew: true,
    extraHeaders: { Cookie: revokedCookie },
  })
  sockets.push(badSocket)
  const badJoinAck = await new Promise((resolve) => {
    badSocket.emit('player:join', { code: privRoom.code, name: 'Хак', playerToken: token(15) }, resolve)
  })
  assert.equal(badJoinAck.error, 'Этот квиз только для выбранного класса. Войдите под своим логином.')

  // Переход к вопросу (старт игры).
  await call(base, `/api/rooms/${privRoom.code}/advance`, { method: 'POST', cookie: orgACookie, json: { hostToken: privRoom.hostToken } })

  // Ученик 2, не входивший в лобби, получает ошибку «Игра уже началась».
  const lateLearner = await call(base, `/api/rooms/${privRoom.code}/join`, {
    method: 'POST',
    cookie: pupil2Cookie,
    json: { name: 'Дана', playerToken: token(16) },
  })
  assert.equal(lateLearner.status, 400)
  assert.deepEqual(lateLearner.body, { error: 'Игра уже началась' })

  // Ученик 1 переподключается через Socket.IO с новым playerToken и отвечает на вопрос.
  const pupilSocket = io(base, {
    transports: ['websocket'],
    forceNew: true,
    extraHeaders: { Cookie: pupil1Cookie },
  })
  sockets.push(pupilSocket)
  const socketReconnect = await new Promise((resolve) => {
    pupilSocket.emit('player:join', { code: privRoom.code, name: 'Другое', playerToken: token(17) }, resolve)
  })
  assert.deepEqual(socketReconnect, { ok: true, name: 'Арман Тест' })

  const answerAck = await new Promise((resolve) => {
    pupilSocket.emit('player:answer', { optionIndex: 0 }, resolve)
  })
  assert.equal(answerAck.ok, true)

  // Завершение игры.
  await call(base, `/api/rooms/${privRoom.code}/advance`, { method: 'POST', json: { hostToken: privRoom.hostToken } })
  await call(base, `/api/rooms/${privRoom.code}/advance`, { method: 'POST', json: { hostToken: privRoom.hostToken } })

  // После подиума комната исчезает из /api/learn/live.
  assert.equal((await call(base, '/api/learn/live', { cookie: pupil1Cookie })).body.quizzes.length, 0)

  // Статистика квиза разделяет публичные и приватные запуски, а статистика платформы и школы учитывает приватный запуск.
  let quizStats
  for (let attempt = 0; attempt < 40; attempt += 1) {
    quizStats = (await call(base, `/api/quizzes/${superQuiz.id}/stats`, { cookie: rootCookie })).body
    if (quizStats.runs === 2) break
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  assert.equal(quizStats.runs, 2)
  assert.deepEqual(quizStats.sessions.map((item) => item.access).sort(), ['private', 'public'])

  const platform = (await call(base, `/api/admin/platform-stats?regionId=${regionA.id}`, { cookie: rootCookie })).body
  assert.equal(platform.totals.quizRuns, 1)
  assert.equal(platform.totals.quizParticipants, 1)
  assert.equal(platform.totals.quizCorrect, 1)
  assert.equal(platform.publicQuizzes.find((item) => item.id === superQuiz.id).runs, 1)

  const orgReport = (await call(base, '/api/admin/org-stats', { cookie: orgACookie })).body
  assert.equal(orgReport.totals.quizRuns, 1)
  assert.equal(orgReport.totals.quizParticipants, 1)
  assert.equal(orgReport.quizzes[0].id, superQuiz.id)
  assert.equal(orgReport.quizzes[0].rate, 100)
})
