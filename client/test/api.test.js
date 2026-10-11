import assert from 'node:assert/strict'
import test from 'node:test'
import { api } from '../src/api/index.js'
import { formatCode } from '../src/lib/format.js'
import { newId } from '../src/lib/ids.js'
import { forgetPlayerToken, readHostToken, readPlayerToken, saveHostToken, savePlayerToken } from '../src/state/roomTokens.js'

const calls = []
let reply = { status: 200, body: { ok: true } }

globalThis.fetch = async (url, init) => {
  calls.push({ url, init })
  const body = typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body)
  return new Response(body, { status: reply.status })
}

const json = { 'Content-Type': 'application/json' }
const get = (url) => ({ url, init: { credentials: 'include', headers: json } })
const send = (url, method, body) => ({
  url,
  init: { credentials: 'include', headers: json, method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) },
})
const upload = (url, method, body, headers) => ({ url, init: { credentials: 'include', headers, method, body } })

const xlsx = new File(['xlsx'], 'Список.xlsx')
const pptx = new File(['pptx'], 'Урок.pptx')
const video = new File(['video'], 'Ролик о планетах.mp4', { type: 'video/mp4' })
const bare = new File(['video'], '')

const cases = [
  [() => api.me(), get('/api/me')],
  [() => api.login('host', 'secret'), send('/api/login', 'POST', { login: 'host', password: 'secret' })],
  [() => api.logout(), send('/api/logout', 'POST')],
  [() => api.dashboard(), get('/api/admin/dashboard')],
  [() => api.regions(), get('/api/admin/regions')],
  [() => api.createRegion({ name: 'Р' }), send('/api/admin/regions', 'POST', { name: 'Р' })],
  [() => api.updateRegion('r1', { name: 'Р' }), send('/api/admin/regions/r1', 'PATCH', { name: 'Р' })],
  [() => api.deleteRegion('r1'), send('/api/admin/regions/r1', 'DELETE')],
  [() => api.regionalAdmins(), get('/api/admin/regional-admins')],
  [() => api.createRegionalAdmin({ login: 'a' }), send('/api/admin/regional-admins', 'POST', { login: 'a' })],
  [() => api.updateRegionalAdmin('u1', { login: 'a' }), send('/api/admin/regional-admins/u1', 'PATCH', { login: 'a' })],
  [() => api.deleteRegionalAdmin('u1'), send('/api/admin/regional-admins/u1', 'DELETE')],
  [() => api.organizations(), get('/api/admin/organizations')],
  [() => api.createOrganization({ name: 'О' }), send('/api/admin/organizations', 'POST', { name: 'О' })],
  [() => api.updateOrganization('o1', { name: 'О' }), send('/api/admin/organizations/o1', 'PATCH', { name: 'О' })],
  [() => api.deleteOrganization('o1'), send('/api/admin/organizations/o1', 'DELETE')],
  [() => api.orgAdmins(), get('/api/admin/org-admins')],
  [() => api.createOrgAdmin({ login: 'b' }), send('/api/admin/org-admins', 'POST', { login: 'b' })],
  [() => api.updateOrgAdmin('u2', { login: 'b' }), send('/api/admin/org-admins/u2', 'PATCH', { login: 'b' })],
  [() => api.deleteOrgAdmin('u2'), send('/api/admin/org-admins/u2', 'DELETE')],
  [() => api.structure(), get('/api/admin/structure')],
  [() => api.createTrack({ name: 'К' }), send('/api/admin/tracks', 'POST', { name: 'К' })],
  [() => api.updateTrack('t1', { name: 'К' }), send('/api/admin/tracks/t1', 'PATCH', { name: 'К' })],
  [() => api.deleteTrack('t1'), send('/api/admin/tracks/t1', 'DELETE')],
  [() => api.createClass({ grade: 5, name: '5а' }), send('/api/admin/classes', 'POST', { grade: 5, name: '5а' })],
  [() => api.updateClass('c1', { name: '5б' }), send('/api/admin/classes/c1', 'PATCH', { name: '5б' })],
  [() => api.deleteClass('c1'), send('/api/admin/classes/c1', 'DELETE')],
  [() => api.learners(), get('/api/admin/learners')],
  [() => api.learners({ classId: '', search: 'Ан на', offset: 0, limit: 100, extra: null }), get('/api/admin/learners?search=%D0%90%D0%BD+%D0%BD%D0%B0&offset=0&limit=100')],
  [() => api.importLearners(xlsx), upload('/api/admin/learners/import', 'POST', xlsx, { 'Content-Type': 'application/octet-stream' })],
  [() => api.createLearner({ login: 'c' }), send('/api/admin/learners', 'POST', { login: 'c' })],
  [() => api.updateLearner('l1', { login: 'c' }), send('/api/admin/learners/l1', 'PATCH', { login: 'c' })],
  [() => api.deleteLearner('l1'), send('/api/admin/learners/l1', 'DELETE')],
  [() => api.lessons(), get('/api/lessons')],
  [() => api.lesson('s1'), get('/api/lessons/s1')],
  [() => api.checkLesson('s1', [{ questionId: 'q', optionIndex: 1 }]), send('/api/lessons/s1/check', 'POST', { answers: [{ questionId: 'q', optionIndex: 1 }] })],
  [() => api.createLesson({ title: 'У' }), send('/api/admin/lessons', 'POST', { title: 'У' })],
  [() => api.updateLesson('s1', { title: 'У' }), send('/api/admin/lessons/s1', 'PATCH', { title: 'У' })],
  [() => api.uploadLessonVideo('s1', video), upload('/api/admin/lessons/s1/video', 'PUT', video, { 'Content-Type': 'video/mp4', 'X-File-Name': encodeURIComponent('Ролик о планетах.mp4') })],
  [() => api.uploadLessonVideo('s1', bare), upload('/api/admin/lessons/s1/video', 'PUT', bare, { 'Content-Type': 'application/octet-stream', 'X-File-Name': 'video' })],
  [() => api.importPptx(pptx), upload('/api/admin/lessons/pptx', 'POST', pptx, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })],
  [() => api.deleteLesson('s1'), send('/api/admin/lessons/s1', 'DELETE')],
  [() => api.quizzes(), get('/api/quizzes')],
  [() => api.quiz('q1'), get('/api/quizzes/q1')],
  [() => api.createQuiz({ title: 'К' }), send('/api/quizzes', 'POST', { title: 'К' })],
  [() => api.updateQuiz('q1', { title: 'К' }), send('/api/quizzes/q1', 'PUT', { title: 'К' })],
  [() => api.deleteQuiz('q1'), send('/api/quizzes/q1', 'DELETE')],
  [() => api.results(), get('/api/results')],
  [() => api.stats(), get('/api/stats')],
  [() => api.quizStats('q1'), get('/api/quizzes/q1/stats')],
  [() => api.createRoom('q1'), send('/api/rooms', 'POST', { quizId: 'q1' })],
  [() => api.room('123456'), get('/api/rooms/123456')],
  [() => api.hostRoom('123456', 'a+b/c='), get('/api/rooms/123456/host?token=a%2Bb%2Fc%3D')],
  [() => api.advanceRoom('123456', 'tok'), send('/api/rooms/123456/advance', 'POST', { hostToken: 'tok' })],
  [() => api.joinRoom('123456', { name: 'Аня', playerToken: 'p' }), send('/api/rooms/123456/join', 'POST', { name: 'Аня', playerToken: 'p' })],
  [() => api.playRoom('123456', 'p t'), get('/api/rooms/123456/play?token=p%20t')],
  [() => api.answerRoom('123456', 'p', 2), send('/api/rooms/123456/answer', 'POST', { playerToken: 'p', optionIndex: 2 })],
  [() => api.network(), get('/api/network')],
  [() => api.importQuestions(xlsx), upload('/api/import', 'POST', xlsx, { 'Content-Type': 'application/octet-stream' })],
]

test('каждый метод api отправляет тот же запрос', async () => {
  assert.equal(cases.length, Object.keys(api).length + 2)
  for (const [run, expected] of cases) {
    calls.length = 0
    assert.deepEqual(await run(), { ok: true })
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0], expected, expected.url)
  }
})

test('файлы проверяются до отправки', async () => {
  calls.length = 0
  const rejects = [
    [() => api.importLearners({ name: 'a.csv', size: 1 }), 'Нужен файл Excel .xlsx'],
    [() => api.importLearners(null), 'Нужен файл Excel .xlsx'],
    [() => api.importLearners({ name: 'a.XLSX', size: 5 * 1024 * 1024 + 1 }), 'Файл больше 5 МБ'],
    [() => api.importPptx({ name: 'a.ppt', size: 1 }), 'Нужна презентация PowerPoint .pptx'],
    [() => api.importPptx({ name: 'a.pptx', size: 30 * 1024 * 1024 + 1 }), 'Презентация больше 30 МБ'],
    [() => api.importQuestions({ name: 'a.xls', size: 1 }), 'Нужен файл Excel .xlsx'],
    [() => api.importQuestions({ name: 'a.xlsx', size: 2 * 1024 * 1024 + 1 }), 'Файл больше 2 МБ'],
  ]
  for (const [run, message] of rejects) await assert.rejects(run, { message })
  assert.equal(calls.length, 0)
  assert.deepEqual(await api.importLearners({ name: 'a.xlsx', size: 5 * 1024 * 1024 }), { ok: true })
})

test('ошибки ответа превращаются в Error с текстом сервера', async () => {
  try {
    reply = { status: 400, body: { error: 'Квиз не найден' } }
    await assert.rejects(api.quiz('x'), { message: 'Квиз не найден' })
    reply = { status: 500, body: 'not json' }
    await assert.rejects(api.quiz('x'), { message: 'Ошибка запроса (500)' })
    reply = { status: 404, body: { error: 42 } }
    await assert.rejects(api.quiz('x'), { message: 'Ошибка запроса (404)' })
    reply = { status: 200, body: 'not json' }
    assert.deepEqual(await api.quiz('x'), {})
  } finally {
    reply = { status: 200, body: { ok: true } }
  }
})

test('код комнаты, ключи хранилища и id', () => {
  assert.equal(formatCode('123456'), '123 456')
  assert.equal(formatCode(654321), '654 321')
  assert.equal(formatCode('12345'), '12345')
  const store = new Map()
  globalThis.sessionStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  }
  saveHostToken('123456', 'host-token')
  savePlayerToken('123456', 'player-token')
  assert.deepEqual([...store.entries()], [['host:123456', 'host-token'], ['player:123456', 'player-token']])
  assert.equal(readHostToken('123456'), 'host-token')
  assert.equal(readPlayerToken('123456'), 'player-token')
  forgetPlayerToken('123456')
  assert.equal(readPlayerToken('123456'), null)
  assert.deepEqual([...store.keys()], ['host:123456'])
  const id = newId()
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.notEqual(newId(), id)
})
