import assert from 'node:assert/strict'
import test from 'node:test'
import { useTestDatabase } from './helpers/db.js'

await useTestDatabase('admin')
process.env.SESSION_SECRET = 'test-secret'
process.env.SUPER_LOGIN = 'root'
process.env.SUPER_PASSWORD = 'rootpass'

test('регион видит своих, организация собирает классы', async () => {
  const admin = await import('../src/admin.js')
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

  const school = await admin.createOrganization(regional, {
    name: 'Школа №3',
    groups: { grades_5_9: true, students: true },
  })
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
  const { authenticate } = await import('../src/services/accounts.js')
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

  const regionStats = await admin.dashboard(regional)
  assert.equal(regionStats.cards.find((card) => card.label === 'Тестируемых').value, 5)
  assert.equal(regionStats.cards.find((card) => card.label === 'Организаций').value, 1)
  const orgStats = await admin.dashboard(orgAdmin)
  assert.equal(orgStats.cards.find((card) => card.label === 'Тестируемых').value, 5)
  const outside = await admin.dashboard(outsider)
  assert.equal(outside.cards.find((card) => card.label === 'Тестируемых').value, 0)

  await assert.rejects(() => admin.deleteClass(orgAdmin, classA.id), (error) => error.message.includes('тестируемые'))
  await assert.rejects(
    () => admin.updateOrganization(regional, school.id, { name: school.name, groups: { students: true } }),
    (error) => error.message.includes('Нельзя снять группу'),
  )
  await assert.rejects(() => admin.createRegion(orgAdmin, { name: 'Новый' }), (error) => error.status === 403)

  const { createApp } = await import('../src/index.js')
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
  } finally {
    await new Promise((resolve) => httpServer.close(resolve))
  }
})
