import assert from 'node:assert/strict'
import test from 'node:test'
import { api } from '../src/api/index.js'
import { formatCode } from '../src/lib/format.js'
import { newId } from '../src/lib/ids.js'
import { groupLessons } from '../src/lib/lessons.js'
import { lessonLockState, lessonTestState } from '../src/state/lessonView.js'
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
  [() => api.registerOptions(), get('/api/register/options')],
  [() => api.register({ role: 'org', organizationId: 'o1', firstName: 'Арман', lastName: 'Сериков', email: 'arman@school.kz', password: 'secret1' }), send('/api/register', 'POST', { role: 'org', organizationId: 'o1', firstName: 'Арман', lastName: 'Сериков', email: 'arman@school.kz', password: 'secret1' })],
  [() => api.dashboard(), get('/api/admin/dashboard')],
  [() => api.platformStats('r1'), get('/api/admin/platform-stats?regionId=r1')],
  [() => api.orgStats('o1'), get('/api/admin/org-stats?organizationId=o1')],
  [() => api.seedCatalog('r1'), send('/api/admin/catalog', 'POST', { regionId: 'r1' })],
  [() => api.districts(), get('/api/admin/districts')],
  [() => api.createDistrict({ name: 'Б' }), send('/api/admin/districts', 'POST', { name: 'Б' })],
  [() => api.deleteDistrict('d1'), send('/api/admin/districts/d1', 'DELETE')],
  [() => api.regions(), get('/api/admin/regions')],
  [() => api.createRegion({ name: 'Р' }), send('/api/admin/regions', 'POST', { name: 'Р' })],
  [() => api.updateRegion('r1', { name: 'Р' }), send('/api/admin/regions/r1', 'PATCH', { name: 'Р' })],
  [() => api.deleteRegion('r1'), send('/api/admin/regions/r1', 'DELETE')],
  [() => api.regionalAdmins(), get('/api/admin/regional-admins')],
  [() => api.createRegionalAdmin({ login: 'a' }), send('/api/admin/regional-admins', 'POST', { login: 'a' })],
  [() => api.updateRegionalAdmin('u1', { login: 'a' }), send('/api/admin/regional-admins/u1', 'PATCH', { login: 'a' })],
  [() => api.deleteRegionalAdmin('u1'), send('/api/admin/regional-admins/u1', 'DELETE')],
  [() => api.organizations(), get('/api/admin/organizations')],
  [() => api.launchTargets(), get('/api/admin/launch-targets')],
  [() => api.launchQuizzes(), get('/api/admin/launch-quizzes')],
  [() => api.createOrganization({ name: 'О' }), send('/api/admin/organizations', 'POST', { name: 'О' })],
  [() => api.updateOrganization('o1', { name: 'О' }), send('/api/admin/organizations/o1', 'PATCH', { name: 'О' })],
  [() => api.deleteOrganization('o1'), send('/api/admin/organizations/o1', 'DELETE')],
  [() => api.orgAdmins(), get('/api/admin/org-admins')],
  [() => api.createOrgAdmin({ login: 'b' }), send('/api/admin/org-admins', 'POST', { login: 'b' })],
  [() => api.updateOrgAdmin('u2', { login: 'b' }), send('/api/admin/org-admins/u2', 'PATCH', { login: 'b' })],
  [() => api.deleteOrgAdmin('u2'), send('/api/admin/org-admins/u2', 'DELETE')],
  [() => api.structure(), get('/api/admin/structure')],
  [() => api.structure('o1'), get('/api/admin/structure?organizationId=o1')],
  [() => api.learnerTargets(), get('/api/admin/learners/targets')],
  [() => api.createTrack({ name: 'К' }), send('/api/admin/tracks', 'POST', { name: 'К' })],
  [() => api.updateTrack('t1', { name: 'К' }), send('/api/admin/tracks/t1', 'PATCH', { name: 'К' })],
  [() => api.deleteTrack('t1'), send('/api/admin/tracks/t1', 'DELETE')],
  [() => api.createClass({ grade: 5, name: '5а' }), send('/api/admin/classes', 'POST', { grade: 5, name: '5а' })],
  [() => api.updateClass('c1', { name: '5б' }), send('/api/admin/classes/c1', 'PATCH', { name: '5б' })],
  [() => api.deleteClass('c1'), send('/api/admin/classes/c1', 'DELETE')],
  [() => api.learners(), get('/api/admin/learners')],
  [() => api.learners({ classId: '', search: 'Ан на', offset: 0, limit: 100, extra: null }), get('/api/admin/learners?search=%D0%90%D0%BD+%D0%BD%D0%B0&offset=0&limit=100')],
  [() => api.importLearners(xlsx), upload('/api/admin/learners/import', 'POST', xlsx, { 'Content-Type': 'application/octet-stream' })],
  [() => api.importLearners(xlsx, { organizationId: 'o1', classId: 'c1' }), upload('/api/admin/learners/import?organizationId=o1&classId=c1', 'POST', xlsx, { 'Content-Type': 'application/octet-stream' })],
  [() => api.bulkLearners({ classId: 'c1', text: 'Иванов Иван' }), send('/api/admin/learners/bulk', 'POST', { classId: 'c1', text: 'Иванов Иван' })],
  [() => api.createLearner({ login: 'c' }), send('/api/admin/learners', 'POST', { login: 'c' })],
  [() => api.updateLearner('l1', { login: 'c' }), send('/api/admin/learners/l1', 'PATCH', { login: 'c' })],
  [() => api.deleteLearner('l1'), send('/api/admin/learners/l1', 'DELETE')],
  [() => api.lessons(), get('/api/lessons')],
  [() => api.lesson('s1'), get('/api/lessons/s1')],
  [() => api.lesson('s1', 'kk'), get('/api/lessons/s1?lang=kk')],
  [() => api.checkLesson('s1', [{ questionId: 'q', optionIndex: 1 }]), send('/api/lessons/s1/check', 'POST', { answers: [{ questionId: 'q', optionIndex: 1 }] })],
  [() => api.checkLesson('s1', [{ questionId: 'q', optionIndex: 1 }], 'kk'), send('/api/lessons/s1/check', 'POST', { answers: [{ questionId: 'q', optionIndex: 1 }], lang: 'kk' })],
  [() => api.createLesson({ title: 'У' }), send('/api/admin/lessons', 'POST', { title: 'У' })],
  [() => api.updateLesson('s1', { title: 'У' }), send('/api/admin/lessons/s1', 'PATCH', { title: 'У' })],
  [() => api.uploadLessonVideo('s1', video), upload('/api/admin/lessons/s1/video?lang=ru', 'PUT', video, { 'Content-Type': 'video/mp4', 'X-File-Name': encodeURIComponent('Ролик о планетах.mp4'), 'X-Lang': 'ru' })],
  [() => api.uploadLessonVideo('s1', bare), upload('/api/admin/lessons/s1/video?lang=ru', 'PUT', bare, { 'Content-Type': 'application/octet-stream', 'X-File-Name': 'video', 'X-Lang': 'ru' })],
  [() => api.uploadLessonVideo('s1', video, null, 'kk'), upload('/api/admin/lessons/s1/video?lang=kk', 'PUT', video, { 'Content-Type': 'video/mp4', 'X-File-Name': encodeURIComponent('Ролик о планетах.mp4'), 'X-Lang': 'kk' })],
  [() => api.deleteLessonVideo('s1', 'kk'), send('/api/admin/lessons/s1/video?lang=kk', 'DELETE')],
  [() => api.importPptx(pptx), upload('/api/admin/lessons/pptx?lang=ru', 'POST', pptx, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'X-Lang': 'ru' })],
  [() => api.importPptx(pptx, 'kk'), upload('/api/admin/lessons/pptx?lang=kk', 'POST', pptx, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'X-Lang': 'kk' })],
  [() => api.deleteLesson('s1'), send('/api/admin/lessons/s1', 'DELETE')],
  [() => api.lessonSections(), get('/api/admin/lesson-sections')],
  [() => api.createLessonSection({ name: 'Б' }), send('/api/admin/lesson-sections', 'POST', { name: 'Б' })],
  [() => api.updateLessonSection('s1', { name: 'Б' }), send('/api/admin/lesson-sections/s1', 'PATCH', { name: 'Б' })],
  [() => api.deleteLessonSection('s1'), send('/api/admin/lesson-sections/s1', 'DELETE')],
  [() => api.assignLessonSection('s1', 'sec'), send('/api/admin/lessons/s1/section', 'PATCH', { sectionId: 'sec' })],
  [() => api.reorderLesson('s1', { direction: -1 }), send('/api/admin/lessons/s1/order', 'PATCH', { direction: -1 })],
  [() => api.quizzes(), get('/api/quizzes')],
  [() => api.quiz('q1'), get('/api/quizzes/q1')],
  [() => api.createQuiz({ title: 'К' }), send('/api/quizzes', 'POST', { title: 'К' })],
  [() => api.updateQuiz('q1', { title: 'К' }), send('/api/quizzes/q1', 'PUT', { title: 'К' })],
  [() => api.deleteQuiz('q1'), send('/api/quizzes/q1', 'DELETE')],
  [() => api.results(), get('/api/results')],
  [() => api.stats(), get('/api/stats')],
  [() => api.quizStats('q1'), get('/api/quizzes/q1/stats')],
  [() => api.createRoom('q1'), send('/api/rooms', 'POST', { quizId: 'q1' })],
  [() => api.createRoom({ quizId: 'q1', mode: 'private', organizationId: 'o1', classId: 'c1' }), send('/api/rooms', 'POST', { quizId: 'q1', mode: 'private', organizationId: 'o1', classId: 'c1' })],
  [() => api.liveQuizzes(), get('/api/learn/live')],
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
  assert.equal(cases.length, Object.keys(api).length + 8)
  for (const [run, expected] of cases) {
    calls.length = 0
    assert.deepEqual(await run(), { ok: true })
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0], expected, expected.url)
  }
})

test('exportLearnersExcel отправляет POST и возвращает Blob', async () => {
  calls.length = 0
  const blob = await api.exportLearnersExcel({ learners: [{ login: 'a', password: 'b' }], lang: 'ru' })
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], send('/api/admin/learners/export', 'POST', { learners: [{ login: 'a', password: 'b' }], lang: 'ru' }))
  assert.ok(blob instanceof Blob)
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

test('lessonLockState различает блокировку на текущем и другом языке', () => {
  assert.deepEqual(lessonLockState(null, 'ru'), {
    locked: false,
    lockedLang: null,
    lockedOtherLang: false,
    sameLangResult: false,
  })
  assert.deepEqual(lessonLockState({ attempts: { locked: false }, lang: 'ru' }, 'kk'), {
    locked: false,
    lockedLang: null,
    lockedOtherLang: false,
    sameLangResult: false,
  })
  assert.deepEqual(lessonLockState({ attempts: { locked: true }, lang: 'ru' }, 'ru'), {
    locked: true,
    lockedLang: 'ru',
    lockedOtherLang: false,
    sameLangResult: true,
  })
  assert.deepEqual(lessonLockState({ attempts: { locked: true }, lang: 'ru' }, 'kk'), {
    locked: true,
    lockedLang: 'ru',
    lockedOtherLang: true,
    sameLangResult: false,
  })
  assert.deepEqual(lessonLockState({ attempts: { locked: true }, lang: 'kk' }, 'ru'), {
    locked: true,
    lockedLang: 'kk',
    lockedOtherLang: true,
    sameLangResult: false,
  })
  assert.deepEqual(lessonLockState({ attempts: { locked: true } }, 'kk'), {
    locked: true,
    lockedLang: null,
    lockedOtherLang: false,
    sameLangResult: true,
  })
})

test('lessonTestState ведёт навигацию по одному вопросу и считает ответы', () => {
  const questions = [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }]
  assert.deepEqual(lessonTestState([], {}, 2), {
    questionIndex: 0,
    totalQuestions: 0,
    currentQuestion: null,
    unansweredIndex: -1,
    answeredCount: 0,
    allAnswered: false,
  })
  assert.deepEqual(lessonTestState(questions, { q1: 0, q3: 2 }, 99), {
    questionIndex: 2,
    totalQuestions: 3,
    currentQuestion: { id: 'q3' },
    unansweredIndex: 1,
    answeredCount: 2,
    allAnswered: false,
  })
  assert.deepEqual(lessonTestState(questions, { q1: 0, q2: 1, q3: 2 }, -3), {
    questionIndex: 0,
    totalQuestions: 3,
    currentQuestion: { id: 'q1' },
    unansweredIndex: -1,
    answeredCount: 3,
    allAnswered: true,
  })
})

test('groupLessons группирует уроки по разделам и переносит уроки без раздела в конец', () => {
  const lessons = [
    { id: 'l1', title: 'Без раздела', section: null },
    { id: 'l2', title: 'Бюджет', section: { id: 's2', name: 'Безопасность', sortOrder: 2 } },
    { id: 'l3', title: 'Старт', section: { id: 's1', name: 'Введение', sortOrder: 1 } },
    { id: 'l4', title: 'Второй', section: { id: 's1', name: 'Введение', sortOrder: 1 } },
  ]
  assert.deepEqual(
    groupLessons(lessons, 'ru').map((block) => ({
      key: block.key,
      title: block.title,
      ids: block.lessons.map((item) => item.id),
    })),
    [
      { key: 's1', title: 'Введение', ids: ['l3', 'l4'] },
      { key: 's2', title: 'Безопасность', ids: ['l2'] },
      { key: '', title: '', ids: ['l1'] },
    ],
  )
})
