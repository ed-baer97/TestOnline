import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'testonline-admin-'))
process.env.MEDIA_DIR = path.join(dir, 'media')
process.env.PG_SCHEMA = `t_${crypto.randomBytes(4).toString('hex')}`
process.env.SESSION_SECRET = 'test-secret'
process.env.SUPER_LOGIN = 'root'
process.env.SUPER_PASSWORD = 'rootpass'

test.after(async () => {
  const { closeDatabase } = await import('./db.js')
  await closeDatabase()
})

test('регион видит своих, организация собирает классы', async () => {
  const admin = await import('./admin.js')
  const root = await admin.ensureSuperAdmin()
  assert.equal(root.role, 'super')

  const region = await admin.createRegion(root, { name: 'Мангыстауская область' })
  const otherRegion = await admin.createRegion(root, { name: 'Атырауская область' })
  await assert.rejects(
    () => admin.createRegion(root, { name: 'мангыстауская область' }),
    (error) => error.status === 409,
  )

  const regional = await admin.createRegionalAdmin(root, {
    login: 'mangystau',
    password: 'secret1',
    displayName: 'Айгуль',
    regionId: region.id,
  })
  const outsider = await admin.createRegionalAdmin(root, {
    login: 'atyrau',
    password: 'secret1',
    displayName: 'Ерлан',
    regionId: otherRegion.id,
  })

  const districts = await admin.listDistricts(regional)
  assert.equal(districts.length, 7)
  const school = await admin.createOrganization(regional, {
    name: 'Школа №3',
    districtId: districts[0].id,
    groups: { grades_5_9: true, students: true },
  })
  assert.equal(school.districtId, districts[0].id)
  assert.equal(school.groups.grades_5_9, true)
  assert.equal(school.groups.grades_1_4, false)
  assert.deepEqual(await admin.listOrganizations(outsider), [])
  assert.equal((await admin.listOrganizations(regional)).length, 1)

  const orgAdmin = await admin.createOrgAdmin(regional, {
    login: 'school3',
    password: 'secret1',
    displayName: 'Мадина',
    organizationId: school.id,
  })
  await assert.rejects(
    () => admin.createClass(orgAdmin, { grade: 2, name: '2а' }),
    (error) => error.message.includes('не отмечена'),
  )
  const classA = await admin.createClass(orgAdmin, { grade: 5, name: '5а' })
  await admin.createClass(orgAdmin, { grade: 5, name: '5б' })
  const track = await admin.createTrack(orgAdmin, { name: '1 курс' })
  const group = await admin.createClass(orgAdmin, { trackId: track.id, name: 'ИС-21' })
  await admin.createLearner(orgAdmin, {
    login: 'arman',
    password: 'secret1',
    displayName: 'Арман',
    classId: classA.id,
  })
  await admin.createLearner(orgAdmin, {
    login: 'aida',
    password: 'secret1',
    displayName: 'Аида',
    classId: group.id,
  })

  const ExcelJS = (await import('exceljs')).default
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet('Тестируемые')
  sheet.addRow(['Класс', 'Имя', 'Логин', 'Пароль'])
  sheet.addRow(['5а', 'Дана Ким', 'dana.kim', 'secret9'])
  sheet.addRow(['5б', 'Ерлан Абаев', 'erlan', ''])
  sheet.addRow(['ИС-21 · 1 курс', 'Нурай С.', 'nuray', 'secret9'])
  sheet.addRow(['7в', 'Нет класса', 'nobody', 'secret9'])
  sheet.addRow(['5а', 'Повтор', 'arman', 'secret9'])
  sheet.addRow(['5а', 'Дубль в файле', 'dana.kim', 'secret9'])
  sheet.addRow(['5а', 'Короткий', 'ab', 'secret9'])
  const file = Buffer.from(await book.xlsx.writeBuffer())
  await assert.rejects(() => admin.importLearners(regional, file), (error) => error.status === 403)
  const imported = await admin.importLearners(orgAdmin, file)
  assert.equal(imported.created, 3)
  assert.deepEqual(imported.learners.map((item) => item.login), ['dana.kim', 'erlan', 'nuray'])
  assert.equal(imported.learners[0].password, 'secret9')
  assert.match(imported.learners[1].password, /^[a-z0-9]{8}$/)
  assert.equal(imported.learners[2].classLabel, 'ИС-21 · 1 курс')
  assert.equal(imported.errors.length, 4)
  assert.ok(imported.errors.some((line) => line.includes('7в')))
  assert.ok(imported.errors.some((line) => line.includes('arman') && line.includes('занят')))
  assert.ok(imported.errors.some((line) => line.includes('повторяется')))
  const { authenticate } = await import('./db.js')
  assert.equal((await authenticate('erlan', imported.learners[1].password)).role, 'learner')

  const page = await admin.listLearners(orgAdmin, { limit: 2 })
  assert.equal(page.total, 5)
  assert.equal(page.learners.length, 2)
  const rest = await admin.listLearners(orgAdmin, { limit: 2, offset: 4 })
  assert.equal(rest.learners.length, 1)
  const onlyA = await admin.listLearners(orgAdmin, { classId: classA.id })
  assert.deepEqual(onlyA.learners.map((item) => item.login).sort(), ['arman', 'dana.kim'])
  const found = await admin.listLearners(orgAdmin, { search: 'Дана' })
  assert.equal(found.total, 1)

  const tree = await admin.structure(orgAdmin)
  const fifth = tree.sections.find((section) => section.id === 'grades_5_9').grades.find((grade) => grade.grade === 5)
  assert.deepEqual(fifth.classes.map((item) => item.name), ['5а', '5б'])
  const students = tree.sections.find((section) => section.id === 'students')
  assert.equal(students.tracks[0].classes[0].name, 'ИС-21')

  const platform = await admin.platformStats(root)
  assert.equal(platform.scope, 'platform')
  const homeRegion = platform.regions.find((item) => item.id === region.id)
  assert.equal(homeRegion.districts, 7)
  assert.equal(homeRegion.organizations, 1)
  assert.ok(platform.regions.some((item) => item.id === otherRegion.id))
  const opened = await admin.platformStats(root, region.id)
  assert.equal(opened.scope, 'region')
  assert.equal(opened.districts.length, 7)
  assert.equal(opened.organizations.find((item) => item.id === school.id).district, districts[0].name)
  assert.equal((await admin.platformStats(regional, otherRegion.id)).districts.length, 7)
  const regionalStats = await admin.platformStats(regional)
  assert.equal(regionalStats.districts.length, 7)
  assert.equal(regionalStats.organizations.length, 1)
  assert.ok(regionalStats.districts.every((item) => item.region === region.name))
  assert.equal((await admin.platformStats(outsider)).districts.length, 0)
  assert.equal((await admin.platformStats(outsider)).organizations.length, 0)
  await assert.rejects(() => admin.platformStats(orgAdmin), (error) => error.status === 403)

  const regionStats = await admin.dashboard(regional)
  assert.equal(regionStats.cards.find((card) => card.label === 'Тестируемых').value, 5)
  assert.equal(regionStats.cards.find((card) => card.label === 'Организаций').value, 1)
  const orgStats = await admin.dashboard(orgAdmin)
  assert.equal(orgStats.cards.find((card) => card.label === 'Тестируемых').value, 5)
  const outside = await admin.dashboard(outsider)
  assert.equal(outside.cards.find((card) => card.label === 'Тестируемых').value, 0)

  await assert.rejects(() => admin.deleteClass(orgAdmin, classA.id), (error) => error.message.includes('тестируемые'))
  await assert.rejects(
    () => admin.updateOrganization(regional, school.id, { name: school.name, districtId: school.districtId, groups: { students: true } }),
    (error) => error.message.includes('Нельзя снять группу'),
  )
  await assert.rejects(() => admin.createRegion(orgAdmin, { name: 'Новый' }), (error) => error.status === 403)

  const { db } = await import('./db.js')
  const lessonId = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.run(
    `INSERT INTO lessons (id, title, grades_1_4, grades_5_9, grades_10_11, students, slides, questions, created_at, updated_at)
     VALUES (?, 'Районный урок', 0, 1, 0, 0, '[]', ?, ?, ?)`,
    lessonId,
    JSON.stringify([
      { id: 'q1', text: 'Сколько?', correctIndex: 0, options: [{ text: 'Два' }, { text: 'Один' }] },
      { id: 'q2', text: 'Где?', correctIndex: 1, options: [{ text: 'Там' }, { text: 'Тут' }] },
    ]),
    now,
    now,
  )
  const arman = (await admin.listLearners(orgAdmin, { search: 'Арман' })).learners[0]
  await db.run(
    `INSERT INTO lesson_attempts (id, lesson_id, user_id, score, total, finished_at, answers, lang)
     VALUES (?, ?, ?, 1, 2, ?, ?, 'ru')`,
    crypto.randomUUID(),
    lessonId,
    arman.id,
    now,
    JSON.stringify([{ questionId: 'q1', chosen: 0 }, { questionId: 'q2', chosen: 0 }, { questionId: 'q2', chosen: -1 }]),
  )
  await db.run(
    `INSERT INTO lesson_attempts (id, lesson_id, user_id, score, total, finished_at, answers, lang)
     VALUES (?, ?, ?, 0, 2, ?, '[]', 'ru')`,
    crypto.randomUUID(),
    lessonId,
    crypto.randomUUID(),
    now,
  )
  const byDistrict = await admin.platformStats(root, region.id)
  assert.equal(byDistrict.lessons.find((item) => item.id === lessonId).attempts, 1)
  const fifthBand = byDistrict.lessonBands.find((item) => item.key === 'grades_5_9')
  const lessonNode = fifthBand.groups.find((item) => item.key === lessonId)
  assert.equal(lessonNode.summary[1], 1)
  assert.equal(lessonNode.summary[3], 1)
  const place = lessonNode.groups.find((item) => item.key === school.districtId)
  const orgNode = place.groups.find((item) => item.key === school.id)
  assert.equal(orgNode.summary[1], 1)
  assert.equal(orgNode.summary[2], 1)
  assert.equal(orgNode.summary[3], 1)
  const person = orgNode.table.rows.find((row) => row.cells[0] === 'Арман')
  assert.equal(person.cells[1], 1)
  assert.equal(person.cells[2], 1)
  assert.equal(byDistrict.lessonBands.find((item) => item.key === 'grades_1_4').groups.some((item) => item.key === lessonId), false)
  assert.equal((await admin.platformStats(root)).regions.find((item) => item.id === region.id).rate, 50)
  const home = byDistrict.districts.find((item) => item.id === school.districtId)
  assert.equal(home.correct, 1)
  assert.equal(home.answered, 2)
  assert.equal(home.rate, 50)
  assert.equal(byDistrict.districts.find((item) => item.id !== school.districtId).rate, null)
  const regionalDistricts = await admin.platformStats(regional)
  assert.equal(regionalDistricts.districts.find((item) => item.id === school.districtId).rate, 50)
  assert.ok(regionalDistricts.districts.filter((item) => item.id !== school.districtId).every((item) => item.rate == null))
  const named = await admin.updateLearner(orgAdmin, arman.id, {
    displayName: 'Арман',
    displayNameKk: 'Арман Серіков',
    classId: classA.id,
    password: '',
  })
  assert.equal(named.displayNameKk, 'Арман Серіков')

  const { createQuiz, saveResult } = await import('./db.js')
  const quiz = await createQuiz(root.id, {
    title: 'Про деньги',
    questions: [{ id: 'budget', text: 'Что такое бюджет?', timeLimit: 20, correctIndex: 0, options: [{ text: 'План' }, { text: 'Долг' }] }],
  })
  const hostOwned = await createQuiz('host-user', {
    title: 'Квиз ведущего',
    questions: [{ id: 'q', text: 'Вопрос теста?', timeLimit: 20, correctIndex: 0, options: [{ text: 'Да' }, { text: 'Нет' }] }],
  })
  assert.equal((await admin.listLaunchQuizzes(regional)).some((item) => item.id === quiz.id), true)
  assert.equal((await admin.listLaunchQuizzes(orgAdmin)).some((item) => item.id === quiz.id), true)
  assert.equal((await admin.listLaunchQuizzes(regional)).some((item) => item.id === hostOwned.id), false)
  await assert.rejects(() => admin.listLaunchQuizzes({ role: 'host', id: 'x' }), (error) => error.status === 403)
  await assert.rejects(() => admin.quizForRoom(regional, hostOwned.id, 'private'), (error) => error.status === 404)
  await saveResult({
    userId: root.id,
    quizId: quiz.id,
    quizTitle: quiz.title,
    code: '111111',
    access: 'public',
    startedAt: new Date().toISOString(),
    players: [
      {
        name: 'Айгуль',
        score: 0,
        rank: 1,
        answers: [{ questionId: 'budget', question: 'Что такое бюджет?', chosen: 'Долг', correct: 'План', ok: false, points: 0 }],
      },
    ],
  })
  await saveResult({
    userId: root.id,
    quizId: quiz.id,
    quizTitle: quiz.title,
    code: '222222',
    access: 'private',
    organizationId: school.id,
    startedAt: new Date().toISOString(),
    players: [
      {
        name: 'Арман',
        score: 500,
        rank: 1,
        answers: [{ questionId: 'budget', question: 'Что такое бюджет?', chosen: 'План', correct: 'План', ok: true, points: 500 }],
      },
    ],
  })
  const answered = await admin.platformStats(root, region.id)
  assert.equal(answered.publicQuizzes.find((item) => item.id === quiz.id).correct, 0)
  assert.equal(answered.publicQuizzes.find((item) => item.id === quiz.id).runs, 0)
  const homeOrg = answered.organizations.find((item) => item.id === school.id)
  assert.equal(homeOrg.correct, 1)
  assert.equal(homeOrg.answered, 1)
  assert.equal(homeOrg.rate, 100)
  const privateBand = answered.quizBands.find((item) => item.key === 'grades_5_9')
  const privateQuiz = privateBand.groups.find((item) => item.key === quiz.id)
  assert.equal(privateQuiz.summary[1], 1)
  assert.equal(privateQuiz.summary[3], 1)
  assert.equal(privateQuiz.summary[4], '100%')
  const quizPlace = privateQuiz.groups.find((item) => item.key === school.districtId)
  const quizOrg = quizPlace.groups.find((item) => item.key === school.id)
  assert.equal(quizOrg.table.rows.find((row) => row.cells[0] === 'Арман').cells[2], 1)
  assert.equal(quizOrg.table.rows.find((row) => row.cells[0] === 'Арман').cells[3], '100%')
  assert.equal(answered.quizBands.find((item) => item.key === 'grades_1_4').groups.some((item) => item.key === quiz.id), false)
  const publicBand = answered.quizBands.find((item) => item.key === 'public')
  assert.equal(publicBand.groups.find((item) => item.key === quiz.id).summary[1], 0)
  assert.equal(publicBand.groups.find((item) => item.key === quiz.id).summary[4], '—')
  assert.equal(publicBand.summary[4], '—')
  const regionalAnswered = await admin.platformStats(regional)
  assert.equal(regionalAnswered.publicQuizzes.find((item) => item.id === quiz.id).runs, 0)
  assert.equal(regionalAnswered.organizations.find((item) => item.id === school.id).rate, 100)
  assert.equal(regionalAnswered.mistakes.some((item) => item.text === 'Что такое бюджет?'), false)
  const drilled = await admin.dashboard(regional)
  const learnerRow = drilled.sections.learners.table.rows.find((row) => row.cells[0] === 'Арман')
  assert.equal(learnerRow.cells[3], '50%')
  const learnerOrg = drilled.sections.learners.groups.find((group) => group.summary[0].ru === school.name)
  const learnerClass = learnerOrg.groups.find((group) => String(group.summary[0]).startsWith('5а'))
  assert.equal(learnerClass.table.rows.find((row) => row.cells[0] === 'Арман').cells[1], '50%')
  const classRow = drilled.sections.classes.table.rows.find((row) => row.cells[0].startsWith('5а'))
  assert.equal(classRow.cells[3], '50%')
  const orgRow = drilled.sections.organizations.table.rows.find((row) => row.cells[0].ru === school.name)
  assert.equal(orgRow.cells[3], '67%')
  const orgGroup = drilled.sections.organizations.groups.find((group) => group.summary[0].ru === school.name)
  assert.equal(orgGroup.summary[3], '67%')
  assert.equal(orgGroup.table.rows[0].cells[2], '50%')
  const orgDrill = await admin.dashboard(orgAdmin)
  const classFold = orgDrill.sections.classes.groups.find((group) => String(group.summary[0]).startsWith('5а'))
  assert.equal(classFold.summary[2], '50%')
  assert.equal(classFold.table.rows.find((row) => row.cells[0] === 'Арман').cells[1], '50%')
  const peopleFold = orgDrill.sections.learners.groups.find((group) => String(group.summary[0]).startsWith('5а'))
  assert.equal(peopleFold.table.rows.find((row) => row.cells[0] === 'Арман').cells[1], '50%')
  const bandFold = orgDrill.sections.groups.groups.find((group) => group.summary[0] === '5–9 классы')
  assert.equal(bandFold.summary[2], '50%')
  assert.equal(bandFold.table.rows.find((row) => String(row.cells[0]).startsWith('5а')).cells[2], '50%')
  assert.equal(orgDrill.cards.find((card) => card.label === 'Администраторов').section, undefined)
  const classGroup = drilled.sections.classes.groups.find((group) => group.summary[0].ru === school.name)
  assert.deepEqual(drilled.sections.classes.groupColumns, ['Организация', 'Классы'])
  assert.match(String(classGroup.summary[1]), /^5а/)
  assert.equal(classGroup.table.rows[0].cells[2], '50%')
  assert.equal(answered.mistakes.some((item) => item.text === 'Что такое бюджет?'), false)
  assert.equal((await admin.quizForRoom(regional, quiz.id, 'private')).id, quiz.id)
  await assert.rejects(() => admin.quizForRoom(orgAdmin, quiz.id, 'public'), (error) => error.message.includes('класс'))
  await assert.rejects(() => admin.quizForRoom({ id: root.id, role: 'host' }, quiz.id, 'private'), (error) => error.status === 403)

  const otherSchool = await admin.createOrganization(outsider, {
    name: 'Чужая школа',
    groups: { grades_5_9: true },
  })
  const otherOrg = await admin.createOrgAdmin(outsider, {
    login: 'otherschool',
    password: 'secret1',
    displayName: 'Сара',
    organizationId: otherSchool.id,
  })
  const otherClass = await admin.createClass(otherOrg, { grade: 5, name: '5а' })
  const regionalTargets = await admin.launchTargets(regional)
  assert.equal(regionalTargets.some((item) => item.id === school.id), true)
  assert.equal(regionalTargets.some((item) => item.id === otherSchool.id), false)
  assert.deepEqual((await admin.launchTargets(orgAdmin)).map((item) => item.id), [school.id])
  assert.equal((await admin.privateAudience(regional, school.id, classA.id)).classId, classA.id)
  await assert.rejects(() => admin.privateAudience(regional, otherSchool.id, otherClass.id), (error) => error.message.includes('организац'))
  await assert.rejects(() => admin.privateAudience(orgAdmin, otherSchool.id, otherClass.id), (error) => error.message.includes('организац'))

  const { createApp } = await import('./index.js')
  const { httpServer } = createApp()
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${httpServer.address().port}`
  try {
    const login = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'arman', password: 'secret1' }),
    })
    assert.equal(login.status, 200)
    const cookie = login.headers.get('set-cookie').split(';')[0]
    const denied = await fetch(`${base}/api/admin/dashboard`, { headers: { Cookie: cookie } })
    assert.equal(denied.status, 403)
    const me = await fetch(`${base}/api/me`, { headers: { Cookie: cookie } })
    const body = await me.json()
    assert.equal(body.role, 'learner')
    assert.equal(body.classLabel, '5а · 5 класс')

    const regionalLogin = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'mangystau', password: 'secret1' }),
    })
    const regionalCookie = regionalLogin.headers.get('set-cookie').split(';')[0]
    const catalog = await fetch(`${base}/api/admin/launch-quizzes`, { headers: { Cookie: regionalCookie } })
    assert.equal(catalog.status, 200)
    assert.equal((await catalog.json()).quizzes.some((item) => item.id === quiz.id), true)
    const started = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: regionalCookie },
      body: JSON.stringify({ quizId: quiz.id, mode: 'private', organizationId: school.id, classId: classA.id }),
    })
    assert.equal(started.status, 201)
    assert.equal((await started.json()).access, 'private')
    const outsideRoom = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: regionalCookie },
      body: JSON.stringify({ quizId: quiz.id, mode: 'private', organizationId: otherSchool.id, classId: otherClass.id }),
    })
    assert.equal(outsideRoom.status, 400)

    const orgLogin = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'school3', password: 'secret1' }),
    })
    const orgCookie = orgLogin.headers.get('set-cookie').split(';')[0]
    const orgStarted = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: orgCookie },
      body: JSON.stringify({ quizId: quiz.id, mode: 'private', organizationId: school.id, classId: classA.id }),
    })
    assert.equal(orgStarted.status, 201)
    const orgOutside = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: orgCookie },
      body: JSON.stringify({ quizId: quiz.id, mode: 'private', organizationId: otherSchool.id, classId: otherClass.id }),
    })
    assert.equal(orgOutside.status, 400)
    const orgPublic = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: orgCookie },
      body: JSON.stringify({ quizId: quiz.id }),
    })
    assert.equal(orgPublic.status, 400)
  } finally {
    await new Promise((resolve) => httpServer.close(resolve))
  }

  await admin.deleteOrganization(regional, school.id)
  assert.deepEqual(await admin.listOrganizations(regional), [])
  assert.deepEqual(await admin.listOrgAdmins(regional), [])
  const people = await db.get('SELECT COUNT(*) AS n FROM users WHERE organization_id = ?', school.id)
  const classesLeft = await db.get('SELECT COUNT(*) AS n FROM classes WHERE organization_id = ?', school.id)
  const tracksLeft = await db.get('SELECT COUNT(*) AS n FROM tracks WHERE organization_id = ?', school.id)
  assert.equal(Number(people.n), 0)
  assert.equal(Number(classesLeft.n), 0)
  assert.equal(Number(tracksLeft.n), 0)
})
