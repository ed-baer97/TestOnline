import assert from 'node:assert/strict'
import test from 'node:test'
import { createHost, rawDb, useTestDatabase } from './helpers/db.js'
import { call, login, startServer } from './helpers/http.js'

await useTestDatabase('api-rooms')
process.env.SESSION_SECRET = 'test-secret'

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
  assert.deepEqual(Object.keys(created.body), ['code', 'hostToken', 'title'])
  assert.match(created.body.code, /^\d{6}$/)
  assert.match(created.body.hostToken, /^[\w-]{32}$/)
  assert.equal(created.body.title, 'Комната по REST')
  const { code, hostToken } = created.body

  assert.deepEqual((await call(base, `/api/rooms/${code}`)).body, { code, title: 'Комната по REST', status: 'lobby', playerCount: 0, joinable: true })
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
  assert.deepEqual((await call(base, `/api/rooms/${code}`)).body, { code, title: 'Комната по REST', status: 'question', playerCount: 2, joinable: false })

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
  assert.deepEqual((await call(base, `/api/rooms/${code}`)).body, { code, title: 'Комната по REST', status: 'podium', playerCount: 2, joinable: false })

  const results = (await call(base, '/api/results', { cookie })).body.results
  assert.equal(results.length, 1)
  assert.deepEqual(Object.keys(results[0]), ['title', 'code', 'players', 'finishedAt'])
  assert.equal(results[0].code, code)
  assert.deepEqual(results[0].players.map(({ answers, ...player }) => player), [
    { name: 'Аня', score: points, rank: 1 },
    { name: 'Боря', score: 0, rank: 2 },
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
  assert.deepEqual(Object.keys(stored), ['code', 'hostToken', 'quiz', 'status', 'questionIndex', 'questionStartedAt', 'endsAt', 'saved', 'players', 'createdAt', 'podiumAt', 'startedAt'])
  assert.equal(stored.status, 'lobby')
  assert.equal(stored.hostToken, hostToken)

  await call(base, `/api/rooms/${code}/join`, { method: 'POST', json: { name: 'Аня', playerToken: token(1) } })
  const withPlayer = await readPayload(code)
  assert.deepEqual(Object.keys(withPlayer.players[0]), ['id', 'token', 'name', 'score', 'answered', 'answerIndex', 'lastPoints', 'lastCorrect', 'answers', 'online', 'joinedAt'])
  assert.equal(withPlayer.players[0].online, true)

  await call(base, `/api/rooms/${code}/advance`, { method: 'POST', json: { hostToken } })
  await writePayload(code, { endsAt: Date.now() - 1000 })
  const lazy = (await call(base, `/api/rooms/${code}/host?token=${hostToken}`)).body
  assert.equal(lazy.status, 'reveal')
  assert.equal(lazy.endsAt, null)
  assert.equal((await readPayload(code)).status, 'reveal')
  const timedOut = (await call(base, `/api/rooms/${code}/play?token=${token(1)}`)).body.me
  assert.deepEqual(timedOut, { name: 'Аня', score: 0, answered: false, answerIndex: null, lastPoints: 0, lastCorrect: false, rank: 1 })

  await writePayload(code, { players: [{ ...withPlayer.players[0], name: 'Аня из базы' }] })
  assert.equal((await call(base, `/api/rooms/${code}/host?token=${hostToken}`)).body.players[0].name, 'Аня из базы')

  await writePayload(code, { createdAt: Date.now() - 5 * 60 * 60 * 1000 })
  const expired = await call(base, `/api/rooms/${code}`)
  assert.equal(expired.status, 404)
  assert.deepEqual(expired.body, { error: 'Комната не найдена' })
  assert.equal(await readPayload(code), null)

  const second = await setup(base, 'keeper2')
  await writePayload(second.room.code, { status: 'podium', podiumAt: Date.now() - 31 * 60 * 1000 })
  assert.equal((await call(base, `/api/rooms/${second.room.code}/host?token=${second.room.hostToken}`)).status, 404)
  assert.equal(await readPayload(second.room.code), null)

  const third = await setup(base, 'keeper3')
  await writePayload(third.room.code, { status: 'podium', podiumAt: Date.now() - 29 * 60 * 1000 })
  assert.equal((await call(base, `/api/rooms/${third.room.code}`)).body.status, 'podium')
})

test('пустой optionIndex считается вариантом 0', async (t) => {
  const server = await startServer()
  t.after(() => server.close())
  const { base } = server
  const { room } = await setup(base, 'nulls')
  await call(base, `/api/rooms/${room.code}/join`, { method: 'POST', json: { name: 'Аня', playerToken: token(1) } })
  await call(base, `/api/rooms/${room.code}/advance`, { method: 'POST', json: { hostToken: room.hostToken } })
  const answer = await call(base, `/api/rooms/${room.code}/answer`, { method: 'POST', json: { playerToken: token(1), optionIndex: null } })
  assert.equal(answer.body.ok, true)
  assert.equal((await call(base, `/api/rooms/${room.code}/play?token=${token(1)}`)).body.me.answerIndex, 0)
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
