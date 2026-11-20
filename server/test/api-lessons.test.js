import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
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
    titleKk: 'Күн жүйесі',
    format: 'slides',
    groups: { grades_1_4: false, grades_5_9: true, grades_10_11: false, students: false },
    section: null,
    slideCount: 4,
    slideCountKk: 4,
    questionCount: 4,
    questionCountKk: 4,
    hasVideo: false,
    hasVideoKk: false,
    languages: { ru: true, kk: true },
    best: null,
  }])
  const demoId = list.body.lessons[0].id
  expectError(await call(base, '/api/lessons', { cookie: who.org }), 403, 'Недостаточно прав')
  assert.equal((await call(base, '/api/lessons', { cookie: who.student })).body.lessons.length, 0)

  const demo = (await call(base, `/api/lessons/${demoId}`, { cookie: who.pupil })).body
  assert.deepEqual(Object.keys(demo), [
    'id', 'title', 'titleKk', 'format', 'groups', 'section',
    'slideCount', 'slideCountKk', 'questionCount', 'questionCountKk',
    'hasVideo', 'hasVideoKk', 'languages', 'best',
    'lang', 'available', 'slides', 'video', 'questions', 'attempts',
  ])
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
  assert.deepEqual(Object.keys(repeated), ['score', 'total', 'finishedAt', 'lang', 'results', 'repeated', 'attempts'])
  assert.equal(repeated.lang, 'ru')
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
  const tooLargeVideo = await new Promise((resolve, reject) => {
    const target = new URL(`/api/admin/lessons/${lesson.id}/video`, base)
    let settled = false
    const req = http.request(target, {
      method: 'PUT',
      agent: false,
      headers: {
        Cookie: who.root,
        'Content-Type': 'video/mp4',
        'Content-Length': String(250 * 1024 * 1024 + 1),
      },
    }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        settled = true
        req.destroy()
        resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) })
      })
    })
    req.on('error', (error) => {
      if (!settled) reject(error)
    })
    req.flushHeaders()
  })
  assert.equal(tooLargeVideo.status, 413)
  assert.deepEqual(tooLargeVideo.body, { error: 'Видео больше 250 МБ' })

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
    ['bytes=-4', 206, 'bytes 18-21/22', '6789'],
    ['bytes=-100', 206, 'bytes 0-21/22', bytes.toString()],
    ['bytes=0-100', 206, 'bytes 0-21/22', bytes.toString()],
    ['items=0-1', 200, null, bytes.toString()],
  ]
  for (const [range, status, contentRange, body] of ranges) {
    const response = await call(base, `/api/lessons/${lesson.id}/media`, { cookie: who.pupil, headers: { Range: range } })
    assert.equal(response.status, status, range)
    assert.equal(response.headers.get('content-range'), contentRange, range)
    assert.equal(response.headers.get('content-length'), String(body.length), range)
    assert.equal(response.text, body, range)
  }
  for (const range of ['bytes=30-40', 'bytes=10-5', 'bytes=-0']) {
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

  await call(base, `/api/admin/lessons/${clip.id}/video?lang=kk`, { method: 'PUT', cookie: root, body: Buffer.from('kk01234567'), headers: { 'Content-Type': 'video/mp4' } })
  const mediaKk = await call(base, `/api/lessons/${clip.id}/media?lang=kk`, { cookie: root })
  assert.equal(mediaKk.status, 200)
  assert.equal(mediaKk.headers.get('x-accel-redirect'), `/media-internal/${clip.id}.kk`)
  assert.equal(mediaKk.headers.get('content-type'), 'video/mp4')
  assert.equal(mediaKk.buffer.length, 0)
})

test('двуязычные уроки: отдельная загрузка RU/KK и ответ об отсутствии материала', async (t) => {
  const server = await startServer()
  t.after(() => server.close())
  const { base } = server
  const root = await login(base, 'root', 'rootpass')
  const region = (await call(base, '/api/admin/regions', { method: 'POST', cookie: root, json: { name: 'Регион двуязычия' } })).body
  await call(base, '/api/admin/regional-admins', { method: 'POST', cookie: root, json: { login: 'regbi', password: 'secret1', displayName: 'Регион', regionId: region.id } })
  const regional = await login(base, 'regbi', 'secret1')
  const org = (await call(base, '/api/admin/organizations', { method: 'POST', cookie: regional, json: { name: 'Школа 2', groups: { grades_5_9: true } } })).body
  await call(base, '/api/admin/org-admins', { method: 'POST', cookie: regional, json: { login: 'orgbi', password: 'secret1', displayName: 'Школа 2', organizationId: org.id } })
  const orgCookie = await login(base, 'orgbi', 'secret1')
  const klass = (await call(base, '/api/admin/classes', { method: 'POST', cookie: orgCookie, json: { grade: 6, name: '6а' } })).body
  await call(base, '/api/admin/learners', { method: 'POST', cookie: orgCookie, json: { login: 'pupilbi', password: 'secret1', displayName: 'Ученик', classId: klass.id } })
  const learner = await login(base, 'pupilbi', 'secret1')

  const listed = (await call(base, '/api/lessons', { cookie: learner })).body.lessons
  const demoSummary = listed.find((item) => item.titleKk === 'Күн жүйесі')
  assert.ok(demoSummary)
  const demoKk = (await call(base, `/api/lessons/${demoSummary.id}?lang=kk`, { cookie: learner })).body
  assert.equal(demoKk.lang, 'kk')
  assert.equal(demoKk.available, true)
  assert.equal(demoKk.title, 'Күн жүйесі')
  assert.equal(demoKk.slides.length, 4)
  assert.equal(demoKk.questions.length, 4)

  const demoRu = (await call(base, `/api/lessons/${demoSummary.id}?lang=ru`, { cookie: learner })).body
  const demoRuSubmit = await call(base, `/api/lessons/${demoSummary.id}/check`, {
    method: 'POST',
    cookie: learner,
    json: { lang: 'ru', answers: demoRu.questions.map((q) => ({ questionId: q.id, optionIndex: 0 })) },
  })
  assert.equal(demoRuSubmit.status, 200)
  assert.equal(demoRuSubmit.body.attempts.locked, true)
  const demoKkLocked = (await call(base, `/api/lessons/${demoSummary.id}?lang=kk`, { cookie: learner })).body
  assert.equal(demoKkLocked.available, true)
  assert.equal(demoKkLocked.attempts.locked, true)
  assert.equal(demoKkLocked.attempts.last.lang, 'ru')
  const demoKkRepeat = await call(base, `/api/lessons/${demoSummary.id}/check`, {
    method: 'POST',
    cookie: learner,
    json: { lang: 'kk', answers: [] },
  })
  assert.equal(demoKkRepeat.status, 200)
  assert.equal(demoKkRepeat.body.repeated, true)
  assert.equal(demoKkRepeat.body.lang, 'ru')

  const ruOnly = (await call(base, '/api/admin/lessons', {
    method: 'POST',
    cookie: root,
    json: {
      title: 'Только русский',
      format: 'video',
      groups: { grades_5_9: true },
      questions: [{ text: 'Вопрос RU?', correctIndex: 0, options: [{ text: 'Да' }, { text: 'Нет' }] }],
    },
  })).body
  await call(base, `/api/admin/lessons/${ruOnly.id}/video?lang=ru`, {
    method: 'PUT',
    cookie: root,
    body: Buffer.from('ru-video-bytes'),
    headers: { 'Content-Type': 'video/mp4', 'X-File-Name': 'ru.mp4' },
  })
  const ruViewOk = (await call(base, `/api/lessons/${ruOnly.id}?lang=ru`, { cookie: learner })).body
  assert.equal(ruViewOk.available, true)
  assert.deepEqual(ruViewOk.languages, { ru: true, kk: false })
  assert.equal(ruViewOk.video.name, 'ru.mp4')
  const ruViewMissingKk = (await call(base, `/api/lessons/${ruOnly.id}?lang=kk`, { cookie: learner })).body
  assert.equal(ruViewMissingKk.lang, 'kk')
  assert.equal(ruViewMissingKk.available, false)
  assert.equal(ruViewMissingKk.video, null)
  assert.deepEqual(ruViewMissingKk.questions, [])
  expectError(await call(base, `/api/lessons/${ruOnly.id}/media?lang=kk`, { cookie: learner }), 404, 'Видео не найдено')
  expectError(await call(base, `/api/lessons/${ruOnly.id}/check`, { method: 'POST', cookie: learner, json: { answers: [], lang: 'kk' } }), 400, 'Данный материал не загружен')

  const kkOnly = (await call(base, '/api/admin/lessons', {
    method: 'POST',
    cookie: root,
    json: {
      title: '',
      titleKk: 'Тек қазақша',
      format: 'video',
      groups: { grades_5_9: true },
      questionsKk: [{ text: 'Сұрақ KK?', correctIndex: 1, options: [{ text: 'Жоқ' }, { text: 'Иә' }] }],
    },
  })).body
  assert.equal(kkOnly.status, undefined)
  await call(base, `/api/admin/lessons/${kkOnly.id}/video?lang=kk`, {
    method: 'PUT',
    cookie: root,
    body: Buffer.from('kk-video-bytes'),
    headers: { 'Content-Type': 'video/mp4', 'X-File-Name': 'kk.mp4' },
  })
  const kkViewOk = (await call(base, `/api/lessons/${kkOnly.id}?lang=kk`, { cookie: learner })).body
  assert.equal(kkViewOk.available, true)
  assert.equal(kkViewOk.title, 'Тек қазақша')
  assert.deepEqual(kkViewOk.languages, { ru: false, kk: true })
  assert.equal(kkViewOk.video.name, 'kk.mp4')
  assert.equal((await call(base, `/api/lessons/${kkOnly.id}/media?lang=kk`, { cookie: learner })).text, 'kk-video-bytes')
  const kkCheck = await call(base, `/api/lessons/${kkOnly.id}/check`, {
    method: 'POST',
    cookie: learner,
    json: { lang: 'kk', answers: [{ questionId: kkViewOk.questions[0].id, optionIndex: 1 }] },
  })
  assert.equal(kkCheck.status, 200)
  assert.equal(kkCheck.body.score, 1)
  assert.equal(kkCheck.body.total, 1)
  const kkLocked = (await call(base, `/api/lessons/${kkOnly.id}?lang=kk`, { cookie: learner })).body
  assert.equal(kkLocked.attempts.locked, true)
  assert.equal(kkLocked.attempts.last.lang, 'kk')
  const kkViewMissingRu = (await call(base, `/api/lessons/${kkOnly.id}?lang=ru`, { cookie: learner })).body
  assert.equal(kkViewMissingRu.lang, 'ru')
  assert.equal(kkViewMissingRu.available, false)
  assert.equal(kkViewMissingRu.video, null)
  assert.deepEqual(kkViewMissingRu.questions, [])
  expectError(await call(base, `/api/lessons/${kkOnly.id}/media?lang=ru`, { cookie: learner }), 404, 'Видео не найдено')
  expectError(await call(base, `/api/lessons/${kkOnly.id}/check`, { method: 'POST', cookie: learner, json: { answers: [], lang: 'ru' } }), 400, 'Данный материал не загружен')

  const bothVideo = (await call(base, '/api/admin/lessons', {
    method: 'POST',
    cookie: root,
    json: {
      title: 'Два видео',
      titleKk: 'Екі бейне',
      format: 'video',
      groups: { grades_5_9: true },
      questions: [{ text: 'RU?', correctIndex: 0, options: [{ text: 'Да' }, { text: 'Нет' }] }],
      questionsKk: [{ text: 'KK?', correctIndex: 0, options: [{ text: 'Иә' }, { text: 'Жоқ' }] }],
    },
  })).body
  await call(base, `/api/admin/lessons/${bothVideo.id}/video?lang=ru`, {
    method: 'PUT',
    cookie: root,
    body: Buffer.from('bytes-ru'),
    headers: { 'Content-Type': 'video/mp4', 'X-File-Name': 'both-ru.mp4' },
  })
  await call(base, `/api/admin/lessons/${bothVideo.id}/video?lang=kk`, {
    method: 'PUT',
    cookie: root,
    body: Buffer.from('bytes-kk'),
    headers: { 'Content-Type': 'video/webm', 'X-File-Name': 'both-kk.webm' },
  })
  assert.equal((await call(base, `/api/lessons/${bothVideo.id}/media?lang=ru`, { cookie: learner })).text, 'bytes-ru')
  assert.equal((await call(base, `/api/lessons/${bothVideo.id}/media?lang=kk`, { cookie: learner })).text, 'bytes-kk')
  const delKk = await call(base, `/api/admin/lessons/${bothVideo.id}/video?lang=kk`, { method: 'DELETE', cookie: root })
  assert.equal(delKk.status, 200)
  assert.equal(fs.existsSync(path.join(mediaDir, `${bothVideo.id}.kk`)), false)
  assert.equal(fs.existsSync(path.join(mediaDir, bothVideo.id)), true)
  expectError(await call(base, `/api/lessons/${bothVideo.id}/media?lang=kk`, { cookie: learner }), 404, 'Видео не найдено')
  assert.equal((await call(base, `/api/lessons/${bothVideo.id}/media?lang=ru`, { cookie: learner })).text, 'bytes-ru')

  const pptx = await deck()
  const impRu = (await call(base, '/api/admin/lessons/pptx?lang=ru', {
    method: 'POST',
    cookie: root,
    body: pptx,
    headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  })).body
  const impKk = (await call(base, '/api/admin/lessons/pptx?lang=kk', {
    method: 'POST',
    cookie: root,
    body: pptx,
    headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  })).body
  const ruImgId = impRu.slides[1].fileId
  const kkImgId = impKk.slides[1].fileId
  assert.notEqual(ruImgId, kkImgId)
  assert.equal((await call(base, `/api/lessons/files/${ruImgId}`, { cookie: root })).status, 200)
  assert.equal((await call(base, `/api/lessons/files/${kkImgId}`, { cookie: root })).status, 200)

  const bothSlides = (await call(base, '/api/admin/lessons', {
    method: 'POST',
    cookie: root,
    json: {
      title: 'Две презентации',
      titleKk: 'Екі презентация',
      groups: { grades_5_9: true },
      slides: [
        { id: impRu.slides[0].id, kind: 'frame', tone: 'sun', kicker: 'RU', title: 'RU', lines: ['Текст'] },
        { id: impRu.slides[1].id, kind: 'image', caption: 'RU pic', fileId: ruImgId },
      ],
      slidesKk: [
        { id: impKk.slides[0].id, kind: 'frame', tone: 'orbit', kicker: 'KK', title: 'KK', lines: ['Мәтін'] },
        { id: impKk.slides[1].id, kind: 'image', caption: 'KK pic', fileId: kkImgId },
      ],
      questions: [{ text: 'RU?', correctIndex: 0, options: [{ text: 'Да' }, { text: 'Нет' }] }],
      questionsKk: [{ text: 'KK?', correctIndex: 0, options: [{ text: 'Иә' }, { text: 'Жоқ' }] }],
    },
  })).body
  assert.deepEqual(bothSlides.languages, { ru: true, kk: true })
  assert.equal((await call(base, `/api/lessons/files/${ruImgId}`, { cookie: learner })).status, 200)
  assert.equal((await call(base, `/api/lessons/files/${kkImgId}`, { cookie: learner })).status, 200)
})
