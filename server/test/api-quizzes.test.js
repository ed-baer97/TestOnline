import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'
import { createHost, useTestDatabase } from './helpers/db.js'
import { call, login, startServer } from './helpers/http.js'

await useTestDatabase('api-quizzes')
process.env.SESSION_SECRET = 'test-secret'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const geography = {
  title: '  География  ',
  questions: [{
    id: 'q-1',
    text: 'Столица   Франции?',
    timeLimit: 30,
    correctIndex: 2,
    options: [{ text: 'Рим' }, { text: '' }, { text: 'Париж' }],
  }],
}

test('квизы ведущего: создание, правка, удаление и чужие квизы', async (t) => {
  const server = await startServer()
  t.after(() => server.close())
  const { base } = server
  const host = await createHost('host', 'secret1')
  const cookie = await login(base, 'host', 'secret1')

  const initial = await call(base, '/api/quizzes', { cookie })
  assert.equal(initial.status, 200)
  assert.equal(initial.body.quizzes.length, 1)
  const demo = initial.body.quizzes[0]
  assert.deepEqual(Object.keys(demo), ['id', 'title', 'questionCount', 'updatedAt'])
  assert.equal(demo.title, 'Демо: общий кругозор')
  assert.equal(demo.questionCount, 5)

  const invalid = [
    [{}, 'Название от 2 до 80 символов'],
    [{ title: 'x', questions: [] }, 'Название от 2 до 80 символов'],
    [{ title: 'Квиз', questions: [] }, 'Нужен хотя бы один вопрос, максимум 50'],
    [{ title: 'Квиз', questions: [{ text: 'a', timeLimit: 10, correctIndex: 0, options: [{ text: '1' }, { text: '2' }] }] }, 'Вопрос 1: текст от 2 до 200 символов'],
    [{ title: 'Квиз', questions: [{ text: 'Вопрос', timeLimit: 15, correctIndex: 0, options: [{ text: '1' }, { text: '2' }] }] }, 'Вопрос 1: время 10, 20, 30 или 60 секунд'],
    [{ title: 'Квиз', questions: [{ text: 'Вопрос', timeLimit: 10, correctIndex: 0, options: [{ text: '1' }] }] }, 'Вопрос 1: от 2 до 4 вариантов'],
    [{ title: 'Квиз', questions: [{ text: 'Вопрос', timeLimit: 10, correctIndex: 0, options: [{ text: '1'.repeat(81) }, { text: '2' }] }] }, 'Вопрос 1: вариант длиннее 80 символов'],
  ]
  for (const [body, message] of invalid) {
    const response = await call(base, '/api/quizzes', { method: 'POST', cookie, json: body })
    assert.equal(response.status, 400, message)
    assert.deepEqual(response.body, { error: message })
  }
  const noBody = await call(base, '/api/quizzes', { method: 'POST', cookie })
  assert.equal(noBody.status, 400)
  assert.deepEqual(noBody.body, { error: 'Название от 2 до 80 символов' })

  const created = await call(base, '/api/quizzes', { method: 'POST', cookie, json: geography })
  assert.equal(created.status, 201)
  const quiz = created.body
  assert.deepEqual(Object.keys(quiz), ['id', 'userId', 'title', 'questions', 'createdAt', 'updatedAt'])
  assert.equal(quiz.userId, host.id)
  assert.equal(quiz.title, 'География')
  assert.deepEqual(quiz.questions, [{
    id: 'q-1',
    text: 'Столица Франции?',
    timeLimit: 30,
    options: [{ text: 'Рим' }, { text: 'Париж' }],
    correctIndex: 1,
  }])
  assert.deepEqual(Object.keys(quiz.questions[0]), ['id', 'text', 'timeLimit', 'options', 'correctIndex'])
  assert.equal(quiz.createdAt, quiz.updatedAt)

  const fetched = await call(base, `/api/quizzes/${quiz.id}`, { cookie })
  assert.equal(fetched.status, 200)
  assert.deepEqual(fetched.body, quiz)
  const missing = await call(base, '/api/quizzes/missing', { cookie })
  assert.equal(missing.status, 404)
  assert.deepEqual(missing.body, { error: 'Квиз не найден' })

  const generated = await call(base, '/api/quizzes', {
    method: 'POST',
    cookie,
    json: { title: 'Без id', questions: [{ text: 'Вопрос?', timeLimit: 60, correctIndex: 0, options: [{ text: 'Да' }, { text: 'Нет' }] }] },
  })
  assert.match(generated.body.questions[0].id, /^[0-9a-f-]{36}$/)

  await new Promise((resolve) => setTimeout(resolve, 5))
  const updated = await call(base, `/api/quizzes/${quiz.id}`, {
    method: 'PUT',
    cookie,
    json: { title: 'География 2', questions: quiz.questions },
  })
  assert.equal(updated.status, 200)
  assert.equal(updated.body.title, 'География 2')
  assert.equal(updated.body.createdAt, quiz.createdAt)
  assert.ok(updated.body.updatedAt > quiz.updatedAt)
  const badUpdate = await call(base, `/api/quizzes/${quiz.id}`, { method: 'PUT', cookie, json: { title: 'x' } })
  assert.equal(badUpdate.status, 400)
  assert.deepEqual(badUpdate.body, { error: 'Название от 2 до 80 символов' })
  const missingUpdate = await call(base, '/api/quizzes/missing', { method: 'PUT', cookie, json: geography })
  assert.equal(missingUpdate.status, 404)
  assert.deepEqual(missingUpdate.body, { error: 'Квиз не найден' })

  const listed = await call(base, '/api/quizzes', { cookie })
  assert.deepEqual(listed.body.quizzes.map((item) => item.title), ['География 2', 'Без id', 'Демо: общий кругозор'])

  await createHost('other', 'secret2')
  const otherCookie = await login(base, 'other', 'secret2')
  assert.equal((await call(base, `/api/quizzes/${quiz.id}`, { cookie: otherCookie })).status, 404)
  assert.equal((await call(base, `/api/quizzes/${quiz.id}`, { method: 'PUT', cookie: otherCookie, json: geography })).status, 404)
  const otherDelete = await call(base, `/api/quizzes/${quiz.id}`, { method: 'DELETE', cookie: otherCookie })
  assert.equal(otherDelete.status, 404)
  assert.deepEqual(otherDelete.body, { error: 'Квиз не найден' })
  assert.deepEqual((await call(base, '/api/quizzes', { cookie: otherCookie })).body.quizzes.map((item) => item.title), ['Демо: общий кругозор'])

  const removed = await call(base, `/api/quizzes/${quiz.id}`, { method: 'DELETE', cookie })
  assert.equal(removed.status, 200)
  assert.deepEqual(removed.body, { ok: true })
  assert.equal((await call(base, `/api/quizzes/${quiz.id}`, { method: 'DELETE', cookie })).status, 404)
})

test('шаблон и импорт Excel по API', async (t) => {
  const server = await startServer()
  t.after(() => server.close())
  const { base } = server
  await createHost('excel', 'secret1')
  const cookie = await login(base, 'excel', 'secret1')

  const template = await call(base, '/api/template', { cookie })
  assert.equal(template.status, 200)
  assert.equal(template.headers.get('content-type'), XLSX)
  assert.equal(template.headers.get('content-disposition'), 'attachment; filename="testonline-shablon.xlsx"')
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(template.buffer)
  assert.equal(book.worksheets[0].name, 'Вопросы')
  assert.deepEqual(book.worksheets[0].getRow(1).values.slice(1), ['Вопрос', 'Вариант 1', 'Вариант 2', 'Вариант 3', 'Вариант 4'])
  assert.equal(book.worksheets[0].rowCount, 3)

  const octet = { 'Content-Type': 'application/octet-stream' }
  const empty = await call(base, '/api/import', { method: 'POST', cookie, headers: octet, body: Buffer.alloc(0) })
  assert.equal(empty.status, 400)
  assert.deepEqual(empty.body, { error: 'Файл пустой' })
  const notOctet = await call(base, '/api/import', { method: 'POST', cookie, headers: { 'Content-Type': 'text/plain' }, body: 'abc' })
  assert.equal(notOctet.status, 400)
  assert.deepEqual(notOctet.body, { error: 'Файл пустой' })
  const garbage = await call(base, '/api/import', { method: 'POST', cookie, headers: octet, body: Buffer.from('not an xlsx') })
  assert.equal(garbage.status, 400)
  assert.deepEqual(garbage.body, { error: 'Не удалось прочитать файл. Нужен Excel .xlsx' })

  const unmarked = new ExcelJS.Workbook()
  unmarked.addWorksheet('Вопросы').addRow(['Два плюс два?', '4', '5'])
  const rejected = await call(base, '/api/import', { method: 'POST', cookie, headers: octet, body: Buffer.from(await unmarked.xlsx.writeBuffer()) })
  assert.equal(rejected.status, 400)
  assert.deepEqual(rejected.body, { error: 'Строка 1: залейте правильный ответ цветом, отличным от белого' })

  const fromTemplate = await call(base, '/api/import', { method: 'POST', cookie, headers: octet, body: template.buffer })
  assert.equal(fromTemplate.status, 200)
  assert.deepEqual(fromTemplate.body.questions.map(({ id, ...question }) => question), [
    { text: 'Столица Франции?', timeLimit: 20, options: [{ text: 'Париж' }, { text: 'Рим' }, { text: 'Берлин' }, { text: 'Мадрид' }], correctIndex: 0 },
    { text: 'Сколько будет 7 × 8?', timeLimit: 20, options: [{ text: '56' }, { text: '54' }, { text: '64' }, { text: '48' }], correctIndex: 0 },
  ])

  const tooBig = await call(base, '/api/import', { method: 'POST', cookie, headers: octet, body: Buffer.alloc(2 * 1024 * 1024 + 10) })
  assert.equal(tooBig.status, 413)
})

test('сводка и итоги ведущего без игр', async (t) => {
  const server = await startServer()
  t.after(() => server.close())
  const { base } = server
  await createHost('stats', 'secret1')
  const cookie = await login(base, 'stats', 'secret1')
  const [demo] = (await call(base, '/api/quizzes', { cookie })).body.quizzes

  const overview = await call(base, '/api/stats', { cookie })
  assert.equal(overview.status, 200)
  assert.deepEqual(overview.body, {
    quizzes: 1,
    runs: 0,
    participants: 0,
    averageScore: null,
    byQuiz: [{ quizId: demo.id, title: 'Демо: общий кругозор', questionCount: 5, runs: 0, participants: 0, averageScore: null }],
    recent: [],
    history: [],
  })

  const results = await call(base, '/api/results', { cookie })
  assert.deepEqual(results.body, { results: [] })

  const stats = await call(base, `/api/quizzes/${demo.id}/stats`, { cookie })
  assert.equal(stats.status, 200)
  assert.deepEqual(stats.body, {
    id: demo.id,
    title: 'Демо: общий кругозор',
    questionCount: 5,
    runs: 0,
    participants: 0,
    averageScore: null,
    questions: [
      'Столица Франции?',
      'Сколько планет в Солнечной системе?',
      'Какой газ составляет большую часть воздуха?',
      'Сколько будет 7 × 8?',
      'Самый большой океан Земли?',
    ].map((text) => ({ text, correct: 0, total: 0, rate: null })),
    sessions: [],
  })
  const missing = await call(base, '/api/quizzes/missing/stats', { cookie })
  assert.equal(missing.status, 404)
  assert.deepEqual(missing.body, { error: 'Квиз не найден' })
})
