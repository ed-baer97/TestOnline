import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import JSZip from 'jszip'
import { useTestDatabase } from './helpers/db.js'
import { call, login, startServer } from './helpers/http.js'

const dataDir = await useTestDatabase('api-lessons')
process.env.SESSION_SECRET = 'test-secret'
process.env.SUPER_LOGIN = 'root'
process.env.SUPER_PASSWORD = 'rootpass'

const pixelBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const pixel = `data:image/png;base64,${pixelBase64}`
const mediaDir = path.join(dataDir, 'media')

function expectError(response, status, error) {
  assert.equal(response.status, status, `${error}: ${response.text}`)
  assert.deepEqual(response.body, { error })
}

async function people(base) {
  const root = await login(base, 'root', 'rootpass')
  const region = (await call(base, '/api/admin/regions', { method: 'POST', cookie: root, json: { name: 'Регион уроков' } })).body
  await call(base, '/api/admin/regional-admins', { method: 'POST', cookie: root, json: { login: 'reg', password: 'secret1', displayName: 'Регион', regionId: region.id } })
  const regional = await login(base, 'reg', 'secret1')
  const org = (await call(base, '/api/admin/organizations', { method: 'POST', cookie: regional, json: { name: 'Школа', groups: { grades_5_9: true, students: true } } })).body
  await call(base, '/api/admin/org-admins', { method: 'POST', cookie: regional, json: { login: 'orgadm', password: 'secret1', displayName: 'Школа', organizationId: org.id } })
  const orgCookie = await login(base, 'orgadm', 'secret1')
  const fifth = (await call(base, '/api/admin/classes', { method: 'POST', cookie: orgCookie, json: { grade: 5, name: '5а' } })).body
  const track = (await call(base, '/api/admin/tracks', { method: 'POST', cookie: orgCookie, json: { name: '1 курс' } })).body
  const group = (await call(base, '/api/admin/classes', { method: 'POST', cookie: orgCookie, json: { trackId: track.id, name: 'ИС-21' } })).body
  await call(base, '/api/admin/learners', { method: 'POST', cookie: orgCookie, json: { login: 'pupil', password: 'secret1', displayName: 'Ученик', classId: fifth.id } })
  await call(base, '/api/admin/learners', { method: 'POST', cookie: orgCookie, json: { login: 'student', password: 'secret1', displayName: 'Студент', classId: group.id } })
  return {
    root,
    org: orgCookie,
    pupil: await login(base, 'pupil', 'secret1'),
    student: await login(base, 'student', 'secret1'),
  }
}

function deck() {
  const zip = new JSZip()
  zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/></p:sldIdLst></p:presentation>')
  zip.file('ppt/_rels/presentation.xml.rels', '<Relationships><Relationship Id="rId2" Target="slides/slide1.xml"/><Relationship Id="rId3" Target="slides/slide2.xml"/></Relationships>')
  zip.file('ppt/slides/slide1.xml', '<p:sld xmlns:a="a"><a:p><a:r><a:t>Солнце &amp; Луна</a:t></a:r></a:p><a:p><a:r><a:t>Звезда</a:t></a:r></a:p></p:sld>')
  zip.file('ppt/slides/slide2.xml', '<p:sld></p:sld>')
  zip.file('ppt/slides/_rels/slide2.xml.rels', '<Relationships><Relationship Id="rId1" Target="../media/pic.png"/></Relationships>')
  zip.file('ppt/media/pic.png', Buffer.from(pixelBase64, 'base64'))
  return zip.generateAsync({ type: 'nodebuffer' })
}

const quizPart = {
  groups: { grades_5_9: true },
  questions: [{ text: 'Что на слайде?', correctIndex: 1, options: [{ text: 'Ничего' }, { text: 'Схема' }, { text: '' }] }],
}

test('уроки по HTTP: список, правка, тест, картинки, видео и PowerPoint', async (t) => {
  const server = await startServer()
  t.after(() => server.close())
  const { base } = server
  const who = await people(base)

  const list = await call(base, '/api/lessons', { cookie: who.root })
  assert.equal(list.status, 200)
  assert.deepEqual(list.body.lessons.map(({ id, ...lesson }) => lesson), [{
    title: 'Солнечная система',
    format: 'slides',
    groups: { grades_1_4: false, grades_5_9: true, grades_10_11: false, students: false },
    slideCount: 4,
    questionCount: 4,
    best: null,
  }])
  const demoId = list.body.lessons[0].id
  expectError(await call(base, '/api/lessons', { cookie: who.org }), 403, 'Недостаточно прав')
  assert.equal((await call(base, '/api/lessons', { cookie: who.student })).body.lessons.length, 0)

  const demo = (await call(base, `/api/lessons/${demoId}`, { cookie: who.pupil })).body
  assert.deepEqual(Object.keys(demo), ['id', 'title', 'format', 'groups', 'slideCount', 'questionCount', 'best', 'slides', 'video', 'questions', 'attempts'])
  assert.deepEqual(demo.slides[0], {
    id: 'sun',
    kind: 'frame',
    tone: 'sun',
    kicker: 'Слайд 1',
    title: 'Солнечная система',
    lines: ['Вокруг Солнца движутся восемь планет.', 'Они удерживаются его притяжением и светят отражённым светом.'],
  })
  assert.deepEqual(demo.questions[0], { id: 'planets', text: 'Сколько планет вращается вокруг Солнца?', options: [{ text: '8' }, { text: '7' }, { text: '9' }, { text: '10' }] })
  assert.deepEqual(demo.attempts, { used: 0, max: 1, locked: false, last: null })
  expectError(await call(base, `/api/lessons/${demoId}`, { cookie: who.student }), 404, 'Урок не найден')
  expectError(await call(base, '/api/lessons/missing', { cookie: who.pupil }), 404, 'Урок не найден')
  assert.equal((await call(base, `/api/lessons/${demoId}`, { cookie: who.root })).body.questions[0].correctIndex, 0)

  const answers = demo.questions.map((question, index) => ({ questionId: question.id, optionIndex: index === 0 ? 1 : 0 }))
  const checked = await call(base, `/api/lessons/${demoId}/check`, { method: 'POST', cookie: who.pupil, json: { answers } })
  assert.equal(checked.status, 200)
  assert.deepEqual(checked.body, {
    score: 3,
    total: 4,
    results: [
      { questionId: 'planets', chosen: 1, correctIndex: 0, ok: false },
      { questionId: 'center', chosen: 0, correctIndex: 0, ok: true },
      { questionId: 'third', chosen: 0, correctIndex: 0, ok: true },
      { questionId: 'closest', chosen: 0, correctIndex: 0, ok: true },
    ],
    repeated: false,
    attempts: { used: 1, max: 1, locked: true },
  })
  const repeated = (await call(base, `/api/lessons/${demoId}/check`, { method: 'POST', cookie: who.pupil, json: { answers: [] } })).body
  assert.equal(repeated.repeated, true)
  assert.equal(repeated.score, 3)
  assert.deepEqual(Object.keys(repeated), ['score', 'total', 'finishedAt', 'results', 'repeated', 'attempts'])
  assert.deepEqual(repeated.results, checked.body.results)
  const rootCheck = (await call(base, `/api/lessons/${demoId}/check`, { method: 'POST', cookie: who.root })).body
  assert.deepEqual(rootCheck, {
    score: 0,
    total: 4,
    results: ['planets', 'center', 'third', 'closest'].map((questionId) => ({ questionId, chosen: -1, correctIndex: 0, ok: false })),
    repeated: false,
    attempts: null,
  })
  assert.deepEqual((await call(base, '/api/lessons', { cookie: who.pupil })).body.lessons[0].best, { score: 3, total: 4 })

  process.env.LESSON_MAX_ATTEMPTS = '2'
  try {
    const more = (await call(base, `/api/lessons/${demoId}/check`, { method: 'POST', cookie: who.pupil, json: { answers } })).body
    assert.equal(more.repeated, false)
    assert.deepEqual(more.attempts, { used: 2, max: 2, locked: true })
  } finally {
    delete process.env.LESSON_MAX_ATTEMPTS
  }

  expectError(await call(base, '/api/admin/lessons', { method: 'POST', cookie: who.org, json: {} }), 403, 'Недостаточно прав')
  expectError(await call(base, '/api/admin/lessons', { method: 'POST', cookie: who.root, json: { title: 'Без групп', questions: quizPart.questions } }), 400, 'Отметьте хотя бы одну группу')
  expectError(await call(base, '/api/admin/lessons', { method: 'POST', cookie: who.root, json: { title: 'Картинка', ...quizPart, slides: [{ kind: 'image', caption: 'x' }] } }), 400, 'Слайд 1: загрузите картинку')
  expectError(await call(base, '/api/admin/lessons', { method: 'POST', cookie: who.root, json: { title: 'Картинка', ...quizPart, slides: [{ kind: 'image', dataUrl: 'data:image/gif;base64,R0lG' }] } }), 400, 'Слайд: нужна картинка PNG, JPEG или WebP')
  expectError(await call(base, '/api/admin/lessons', { method: 'POST', cookie: who.root, json: { title: 'Видео', ...quizPart, format: 'audio' } }), 400, 'Неизвестный вид урока')

  const created = await call(base, '/api/admin/lessons', {
    method: 'POST',
    cookie: who.root,
    json: { title: 'Карта', ...quizPart, slides: [{ kind: 'image', caption: '  Схема  ', dataUrl: pixel }, { kind: 'frame', title: 'Текст', lines: ['Одна', '', 'Две'], tone: 'nope' }] },
  })
  assert.equal(created.status, 201)
  const lesson = created.body
  assert.equal(lesson.slideCount, 2)
  assert.deepEqual(lesson.questions, [{ id: lesson.questions[0].id, text: 'Что на слайде?', options: [{ text: 'Ничего' }, { text: 'Схема' }], correctIndex: 1 }])
  const [image, frame] = lesson.slides
  assert.deepEqual(image, { id: image.id, kind: 'image', fileId: image.fileId, caption: 'Схема', imageUrl: `/api/lessons/files/${image.fileId}` })
  assert.deepEqual(frame, { id: frame.id, kind: 'frame', tone: 'orbit', kicker: '', title: 'Текст', lines: ['Одна', 'Две'] })
  assert.equal(lesson.video, null)
  assert.equal(lesson.attempts, null)

  const file = await call(base, `/api/lessons/files/${image.fileId}`, { cookie: who.pupil })
  assert.equal(file.status, 200)
  assert.equal(file.headers.get('content-type'), 'image/png')
  assert.equal(file.headers.get('cache-control'), 'private, max-age=31536000, immutable')
  assert.equal(file.buffer.toString('base64'), pixelBase64)
  expectError(await call(base, `/api/lessons/files/${image.fileId}`, { cookie: who.student }), 404, 'Файл не найден')
  expectError(await call(base, '/api/lessons/files/not-a-uuid', { cookie: who.root }), 404, 'Файл не найден')
  expectError(await call(base, '/api/lessons/files/11111111-2222-4333-8444-555555555555', { cookie: who.root }), 404, 'Файл не найден')
  assert.equal((await call(base, `/api/lessons/files/${image.fileId}`)).status, 401)

  const updated = await call(base, `/api/admin/lessons/${lesson.id}`, {
    method: 'PATCH',
    cookie: who.root,
    json: { title: 'Карта 2', ...quizPart, slides: [{ id: frame.id, kind: 'frame', title: 'Только текст', lines: ['Строка'] }] },
  })
  assert.equal(updated.status, 200)
  assert.deepEqual(updated.body.slides.map((slide) => slide.title), ['Только текст'])
  assert.equal(fs.existsSync(path.join(mediaDir, 'files', image.fileId)), false)
  expectError(await call(base, `/api/lessons/files/${image.fileId}`, { cookie: who.root }), 404, 'Файл не найден')
  expectError(await call(base, '/api/admin/lessons/missing', { method: 'PATCH', cookie: who.root, json: {} }), 404, 'Урок не найден')

  const withImage = (await call(base, `/api/admin/lessons/${lesson.id}`, { method: 'PATCH', cookie: who.root, json: { title: 'Карта 3', ...quizPart, slides: [{ kind: 'image', dataUrl: pixel }] } })).body
  const lostFile = withImage.slides[0].fileId
  fs.rmSync(path.join(mediaDir, 'files', lostFile))
  expectError(await call(base, `/api/lessons/files/${lostFile}`, { cookie: who.root }), 404, 'Файл не найден')

  const asVideo = await call(base, `/api/admin/lessons/${lesson.id}`, { method: 'PATCH', cookie: who.root, json: { title: 'Ролик', ...quizPart, format: 'video' } })
  assert.equal(asVideo.body.format, 'video')
  assert.deepEqual(asVideo.body.slides, [])
  assert.equal(asVideo.body.video, null)
  assert.equal(asVideo.body.slideCount, 0)
  expectError(await call(base, `/api/lessons/${lesson.id}/media`, { cookie: who.root }), 404, 'Видео не найдено')

  const bytes = Buffer.from('video-bytes-0123456789')
  expectError(await call(base, `/api/admin/lessons/${lesson.id}/video`, { method: 'PUT', cookie: who.root, body: bytes, headers: { 'Content-Type': 'text/plain' } }), 400, 'Нужен ролик MP4, WebM, MOV или OGG')
  expectError(await call(base, `/api/admin/lessons/${lesson.id}/video`, { method: 'PUT', cookie: who.root, body: Buffer.alloc(0), headers: { 'Content-Type': 'video/mp4' } }), 400, 'Файл пустой')
  expectError(await call(base, `/api/admin/lessons/${demoId}/video`, { method: 'PUT', cookie: who.root, body: bytes, headers: { 'Content-Type': 'video/mp4' } }), 400, 'Этот урок — презентация')
  expectError(await call(base, `/api/admin/lessons/${lesson.id}/video`, { method: 'PUT', cookie: who.pupil, body: bytes, headers: { 'Content-Type': 'video/mp4' } }), 403, 'Недостаточно прав')
  const garbledName = await call(base, `/api/admin/lessons/${lesson.id}/video`, { method: 'PUT', cookie: who.root, body: bytes, headers: { 'Content-Type': 'video/webm; codecs=vp9', 'X-File-Name': '%E0%A4%A' } })
  assert.deepEqual(garbledName.body.video, { name: 'video', mime: 'video/webm' })
  const uploaded = await call(base, `/api/admin/lessons/${lesson.id}/video`, {
    method: 'PUT',
    cookie: who.root,
    body: bytes,
    headers: { 'Content-Type': 'video/mp4', 'X-File-Name': encodeURIComponent('Планеты.mp4') },
  })
  assert.equal(uploaded.status, 200)
  assert.deepEqual(uploaded.body.video, { name: 'Планеты.mp4', mime: 'video/mp4' })

  const full = await call(base, `/api/lessons/${lesson.id}/media`, { cookie: who.pupil })
  assert.equal(full.status, 200)
  assert.equal(full.headers.get('accept-ranges'), 'bytes')
  assert.equal(full.headers.get('content-type'), 'video/mp4')
  assert.equal(full.headers.get('content-length'), String(bytes.length))
  assert.equal(full.text, bytes.toString())
  const ranges = [
    ['bytes=0-3', 206, 'bytes 0-3/22', 'vide'],
    ['bytes=5-', 206, 'bytes 5-21/22', bytes.subarray(5).toString()],
    ['bytes=-4', 206, 'bytes 0-4/22', 'video'],
    ['bytes=0-100', 206, 'bytes 0-21/22', bytes.toString()],
    ['items=0-1', 200, null, bytes.toString()],
  ]
  for (const [range, status, contentRange, body] of ranges) {
    const response = await call(base, `/api/lessons/${lesson.id}/media`, { cookie: who.pupil, headers: { Range: range } })
    assert.equal(response.status, status, range)
    assert.equal(response.headers.get('content-range'), contentRange, range)
    assert.equal(response.text, body, range)
  }
  for (const range of ['bytes=30-40', 'bytes=10-5']) {
    const response = await call(base, `/api/lessons/${lesson.id}/media`, { cookie: who.pupil, headers: { Range: range } })
    assert.equal(response.status, 416, range)
    assert.equal(response.headers.get('content-range'), 'bytes */22', range)
  }
  expectError(await call(base, `/api/lessons/${lesson.id}/media`, { cookie: who.student }), 404, 'Видео не найдено')
  const learnerView = (await call(base, `/api/lessons/${lesson.id}`, { cookie: who.pupil })).body
  assert.deepEqual(learnerView.video, { name: 'Планеты.mp4', mime: 'video/mp4' })
  assert.equal(learnerView.format, 'video')

  const backToSlides = (await call(base, `/api/admin/lessons/${lesson.id}`, { method: 'PATCH', cookie: who.root, json: { title: 'Снова слайды', ...quizPart, slides: [{ kind: 'frame', title: 'Слайд', lines: ['Строка'] }] } })).body
  assert.equal(backToSlides.video, null)
  assert.equal(fs.existsSync(path.join(mediaDir, lesson.id)), false)

  const pptx = await deck()
  expectError(await call(base, '/api/admin/lessons/pptx', { method: 'POST', cookie: who.pupil, body: pptx }), 403, 'Недостаточно прав')
  expectError(await call(base, '/api/admin/lessons/pptx', { method: 'POST', cookie: who.root, body: Buffer.from('nope') }), 400, 'Нужна презентация PowerPoint .pptx')
  const imported = await call(base, '/api/admin/lessons/pptx', { method: 'POST', cookie: who.root, body: pptx, headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' } })
  assert.equal(imported.status, 200)
  assert.equal(imported.body.truncated, false)
  const [first, second] = imported.body.slides
  assert.deepEqual({ ...first, id: 'x' }, { id: 'x', kind: 'frame', tone: 'sun', kicker: 'Слайд 1', title: 'Солнце & Луна', lines: ['Звезда'] })
  assert.deepEqual({ ...second, id: 'x' }, { id: 'x', kind: 'image', caption: 'Слайд 2', fileId: second.fileId, imageUrl: `/api/lessons/files/${second.fileId}` })
  expectError(await call(base, `/api/lessons/files/${second.fileId}`, { cookie: who.pupil }), 404, 'Файл не найден')
  assert.equal((await call(base, `/api/lessons/files/${second.fileId}`, { cookie: who.root })).status, 200)

  const removed = await call(base, `/api/admin/lessons/${lesson.id}`, { method: 'DELETE', cookie: who.root })
  assert.deepEqual(removed.body, { ok: true })
  expectError(await call(base, `/api/admin/lessons/${lesson.id}`, { method: 'DELETE', cookie: who.root }), 404, 'Урок не найден')
  expectError(await call(base, `/api/lessons/${lesson.id}`, { cookie: who.root }), 404, 'Урок не найден')
})

test('MEDIA_ACCEL=1: файлы отдаёт Nginx через X-Accel-Redirect', async (t) => {
  process.env.MEDIA_ACCEL = '1'
  let server
  try {
    server = await startServer()
  } finally {
    delete process.env.MEDIA_ACCEL
  }
  t.after(() => server.close())
  const { base } = server
  const root = await login(base, 'root', 'rootpass')
  const lesson = (await call(base, '/api/admin/lessons', { method: 'POST', cookie: root, json: { title: 'Ускоренный', ...quizPart, slides: [{ kind: 'image', dataUrl: pixel }] } })).body
  const fileId = lesson.slides[0].fileId
  const file = await call(base, `/api/lessons/files/${fileId}`, { cookie: root })
  assert.equal(file.status, 200)
  assert.equal(file.headers.get('x-accel-redirect'), `/media-internal/files/${fileId}`)
  assert.equal(file.headers.get('content-type'), 'image/png')
  assert.equal(file.headers.get('cache-control'), 'private, max-age=31536000, immutable')
  assert.equal(file.buffer.length, 0)

  const clip = (await call(base, '/api/admin/lessons', { method: 'POST', cookie: root, json: { title: 'Ролик', ...quizPart, format: 'video' } })).body
  await call(base, `/api/admin/lessons/${clip.id}/video`, { method: 'PUT', cookie: root, body: Buffer.from('0123456789'), headers: { 'Content-Type': 'video/ogg' } })
  const media = await call(base, `/api/lessons/${clip.id}/media`, { cookie: root, headers: { Range: 'bytes=0-1' } })
  assert.equal(media.status, 200)
  assert.equal(media.headers.get('x-accel-redirect'), `/media-internal/${clip.id}`)
  assert.equal(media.headers.get('content-type'), 'video/ogg')
  assert.equal(media.headers.get('accept-ranges'), null)
  assert.equal(media.buffer.length, 0)
})
