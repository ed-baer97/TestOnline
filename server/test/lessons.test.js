import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { useTestDatabase } from './helpers/db.js'

await useTestDatabase('lessons')
process.env.SESSION_SECRET = 'test-secret'
process.env.SUPER_LOGIN = 'root'
process.env.SUPER_PASSWORD = 'rootpass'

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

test('урок: презентация, тест и видимость по группе', async () => {
  const admin = await import('../src/admin.js')
  const lessons = await import('../src/lessons.js')
  const root = await admin.ensureSuperAdmin()
  const demoId = await lessons.ensureDemoLesson()
  assert.equal(await lessons.ensureDemoLesson(), demoId)

  const region = await admin.createRegion(root, { name: 'Мангыстауская область' })
  const regional = await admin.createRegionalAdmin(root, {
    login: 'mangystau',
    password: 'secret1',
    displayName: 'Айгуль',
    regionId: region.id,
  })
  const school = await admin.createOrganization(regional, {
    name: 'Школа №3',
    groups: { grades_5_9: true, students: true },
  })
  const orgAdmin = await admin.createOrgAdmin(regional, {
    login: 'school3',
    password: 'secret1',
    displayName: 'Мадина',
    organizationId: school.id,
  })
  const classA = await admin.createClass(orgAdmin, { grade: 5, name: '5а' })
  const pupil = await admin.createLearner(orgAdmin, {
    login: 'arman',
    password: 'secret1',
    displayName: 'Арман',
    classId: classA.id,
  })
  const track = await admin.createTrack(orgAdmin, { name: '1 курс' })
  const group = await admin.createClass(orgAdmin, { trackId: track.id, name: 'ИС-21' })
  const student = await admin.createLearner(orgAdmin, {
    login: 'aida',
    password: 'secret1',
    displayName: 'Аида',
    classId: group.id,
  })

  const forPupil = await lessons.listLessons(pupil)
  assert.equal(forPupil.length, 1)
  assert.equal(forPupil[0].title, 'Солнечная система')
  assert.equal(await lessons.listLessons(student).then((rows) => rows.length), 0)

  const lesson = await lessons.getLesson(pupil, demoId)
  assert.equal(lesson.slides.length, 4)
  assert.equal(lesson.questions[0].correctIndex, undefined)
  assert.deepEqual(lesson.attempts, { used: 0, max: 1, locked: false, last: null })
  const answers = lesson.questions.map((question, index) => ({ questionId: question.id, optionIndex: index === 0 ? 1 : 0 }))
  const checked = await lessons.checkLesson(pupil, demoId, answers)
  assert.equal(checked.score, 3)
  assert.equal(checked.total, 4)
  assert.equal(checked.repeated, false)
  assert.deepEqual(checked.attempts, { used: 1, max: 1, locked: true })
  const again = await lessons.checkLesson(pupil, demoId, lesson.questions.map((question) => ({ questionId: question.id, optionIndex: 0 })))
  assert.equal(again.repeated, true)
  assert.equal(again.score, 3)
  assert.equal(again.results[0].chosen, 1)
  assert.equal(again.results[0].ok, false)
  const stored = await lessons.getLesson(pupil, demoId)
  assert.equal(stored.attempts.locked, true)
  assert.equal(stored.attempts.last.score, 3)
  assert.equal(stored.attempts.last.results[1].ok, true)
  assert.equal((await lessons.listLessons(pupil))[0].best.score, 3)
  const adminCheck = await lessons.checkLesson(root, demoId, answers)
  assert.equal(adminCheck.attempts, null)

  await assert.rejects(() => lessons.createLesson(orgAdmin, {}), (error) => error.status === 403)

  const uploaded = await lessons.createLesson(root, {
    title: 'Карта',
    groups: { grades_5_9: true },
    slides: [{ kind: 'image', caption: 'Схема', dataUrl: pixel }],
    questions: [{
      text: 'Что на слайде?',
      correctIndex: 0,
      options: [{ text: 'Схема' }, { text: 'Ничего' }],
    }],
  })
  assert.equal(uploaded.slides[0].dataUrl, undefined)
  assert.equal(uploaded.slides[0].imageUrl, `/api/lessons/files/${uploaded.slides[0].fileId}`)
  const picture = await lessons.openLessonFile(pupil, uploaded.slides[0].fileId)
  assert.equal(picture.mime, 'image/png')
  assert.equal(fs.readFileSync(picture.path).toString('base64'), pixel.split(',')[1])
  await assert.rejects(() => lessons.openLessonFile(student, uploaded.slides[0].fileId), (error) => error.status === 404)
  await assert.rejects(() => lessons.openLessonFile(pupil, '../etc/passwd'), (error) => error.status === 404)
  const hidden = await lessons.getLesson(pupil, uploaded.id)
  assert.equal(hidden.questions[0].correctIndex, undefined)
  const preview = await lessons.getLesson(root, uploaded.id)
  assert.equal(preview.questions[0].correctIndex, 0)
  await lessons.deleteLesson(root, uploaded.id)
  assert.equal(fs.existsSync(picture.path), false)
  await assert.rejects(() => lessons.openLessonFile(root, uploaded.slides[0].fileId), (error) => error.status === 404)

  const clip = await lessons.createLesson(root, {
    title: 'Ролик о планетах',
    format: 'video',
    groups: { grades_5_9: true },
    questions: [{
      text: 'Что смотрели?',
      correctIndex: 0,
      options: [{ text: 'Ролик' }, { text: 'Ничего' }],
    }],
  })
  assert.equal(clip.format, 'video')
  assert.equal(clip.video, null)
  assert.equal(clip.slides.length, 0)
  const bytes = Buffer.from('video-bytes')
  await assert.rejects(
    () => lessons.saveLessonVideo(root, clip.id, bytes, 'text/plain', 'a.txt'),
    (error) => error.status === 400,
  )
  const withVideo = await lessons.saveLessonVideo(root, clip.id, bytes, 'video/mp4', 'planets.mp4')
  assert.equal(withVideo.video.name, 'planets.mp4')
  assert.equal(withVideo.video.mime, 'video/mp4')
  const media = await lessons.openLessonMedia(pupil, clip.id)
  assert.equal(media.size, bytes.length)
  assert.equal(media.mime, 'video/mp4')
  await assert.rejects(() => lessons.openLessonMedia(student, clip.id), (error) => error.status === 404)
  const listed = await lessons.listLessons(pupil)
  assert.equal(listed.find((item) => item.id === clip.id).format, 'video')
  await lessons.deleteLesson(root, clip.id)
  await assert.rejects(() => lessons.openLessonMedia(root, clip.id), (error) => error.status === 404)

  const png = Buffer.from(pixel.split(',')[1], 'base64')
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId2"/>
    <p:sldId id="257" r:id="rId3"/>
  </p:sldIdLst>
</p:presentation>`)
  zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
</Relationships>`)
  zip.file('ppt/slides/slide1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p><a:r><a:t>Солнце</a:t></a:r></a:p>
    <a:p><a:r><a:t>Звезда в центре</a:t></a:r></a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`)
  zip.file('ppt/slides/slide2.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"></p:sld>`)
  zip.file('ppt/slides/_rels/slide2.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/pic.png"/>
</Relationships>`)
  zip.file('ppt/media/pic.png', png)
  const pptx = await zip.generateAsync({ type: 'nodebuffer' })
  await assert.rejects(() => lessons.importPptx(orgAdmin, pptx), (error) => error.status === 403)
  await assert.rejects(() => lessons.importPptx(root, Buffer.from('not-a-pptx')), (error) => error.status === 400)
  const imported = await lessons.importPptx(root, pptx)
  assert.equal(imported.slides.length, 2)
  assert.equal(imported.slides[0].kind, 'frame')
  assert.equal(imported.slides[0].title, 'Солнце')
  assert.deepEqual(imported.slides[0].lines, ['Звезда в центре'])
  assert.equal(imported.slides[1].kind, 'image')
  assert.ok(imported.slides[1].fileId)
  assert.equal(imported.slides[1].dataUrl, undefined)
  assert.equal(imported.slides[1].imageUrl, `/api/lessons/files/${imported.slides[1].fileId}`)
  await assert.rejects(() => lessons.openLessonFile(pupil, imported.slides[1].fileId), (error) => error.status === 404)
  assert.equal((await lessons.openLessonFile(root, imported.slides[1].fileId)).mime, 'image/png')
  const fromDeck = await lessons.createLesson(root, {
    title: 'Из PowerPoint',
    groups: { grades_5_9: true },
    slides: [
      {
        id: imported.slides[0].id,
        kind: 'frame',
        tone: imported.slides[0].tone,
        kicker: imported.slides[0].kicker,
        title: imported.slides[0].title,
        lines: imported.slides[0].lines,
      },
      {
        id: imported.slides[1].id,
        kind: 'image',
        caption: imported.slides[1].caption,
        fileId: imported.slides[1].fileId,
      },
    ],
    questions: [{
      text: 'Откуда слайды?',
      correctIndex: 0,
      options: [{ text: 'PowerPoint' }, { text: 'Вручную' }],
    }],
  })
  assert.equal(fromDeck.slides[0].title, 'Солнце')
  assert.equal(fromDeck.slides[1].imageUrl, `/api/lessons/files/${imported.slides[1].fileId}`)
  const seen = await lessons.getLesson(pupil, fromDeck.id)
  assert.equal(seen.slides.length, 2)
  assert.equal(seen.slides[1].imageUrl, fromDeck.slides[1].imageUrl)
  assert.equal((await lessons.openLessonFile(pupil, imported.slides[1].fileId)).mime, 'image/png')

  const legacyId = '11111111-2222-4333-8444-555555555555'
  const { db } = await import('../src/db.js')
  await db.run('INSERT INTO lesson_files (id, lesson_id, mime, data_base64) VALUES (?, ?, ?, ?)', legacyId, fromDeck.id, 'image/png', pixel.split(',')[1])
  assert.equal(await lessons.migrateLessonFiles(), 1)
  assert.equal(await lessons.migrateLessonFiles(), 0)
  const migrated = await lessons.openLessonFile(root, legacyId)
  assert.equal(fs.readFileSync(migrated.path).toString('base64'), pixel.split(',')[1])
  assert.equal((await db.get('SELECT data_base64 FROM lesson_files WHERE id = ?', legacyId)).data_base64, '')

  const longText = 'Незнакомец предлагает деньги и просит ничего не рассказывать родителям. Как поступить?'
  const longOption = 'Отказаться, отойти и сразу рассказать родителям или учителю, даже если он кажется добрым'
  assert.ok(longText.length > 80)
  assert.ok(longOption.length > 80)
  const wordy = await lessons.createLesson(root, {
    title: 'Длинный вопрос',
    groups: { grades_5_9: true },
    slides: [{ kind: 'frame', tone: 'orbit', kicker: 'Слайд', title: 'Тема', lines: ['Строка'] }],
    questions: [{
      text: longText,
      correctIndex: 0,
      options: [{ text: longOption }, { text: 'Согласиться' }],
    }],
  })
  assert.equal(wordy.questions[0].text, longText)
  assert.equal(wordy.questions[0].options[0].text, longOption)

  const sharp = (await import('sharp')).default
  const { slidesFromPptx } = await import('../src/pptx.js')
  const huge = await sharp({
    create: { width: 1800, height: 1800, channels: 3, noise: { type: 'gaussian' } },
  }).png().toBuffer()
  assert.ok(huge.length > 1_500_000)
  const heavy = new JSZip()
  heavy.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>
</p:presentation>`)
  heavy.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`)
  heavy.file('ppt/slides/slide1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"></p:sld>`)
  heavy.file('ppt/slides/_rels/slide1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/big.png"/>
</Relationships>`)
  heavy.file('ppt/media/big.png', huge)
  const heavySlides = await slidesFromPptx(await heavy.generateAsync({ type: 'nodebuffer' }))
  assert.equal(heavySlides.slides[0].kind, 'image')
  assert.match(heavySlides.slides[0].dataUrl, /^data:image\/jpeg;base64,/)
})
