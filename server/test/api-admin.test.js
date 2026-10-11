import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'
import { useTestDatabase } from './helpers/db.js'
import { call, login, startServer } from './helpers/http.js'

await useTestDatabase('api-admin')
process.env.SESSION_SECRET = 'test-secret'
process.env.SUPER_LOGIN = 'root'
process.env.SUPER_PASSWORD = 'rootpass'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function expectError(response, status, error) {
  assert.equal(response.status, status, `${error}: ${response.text}`)
  assert.deepEqual(response.body, { error })
}

test('админка по HTTP: регионы, организации, классы и тестируемые', async (t) => {
  const server = await startServer()
  t.after(() => server.close())
  const { base } = server
  const root = await login(base, 'root', 'rootpass')
  const as = (cookie) => (path, options = {}) => call(base, path, { ...options, cookie })
  const su = as(root)

  const empty = await su('/api/admin/dashboard')
  assert.equal(empty.status, 200)
  assert.deepEqual(empty.body, {
    scope: 'platform',
    note: 'Сводка по всем регионам. Результаты тестов появятся здесь вместе с темами.',
    cards: [
      { label: 'Регионов', value: 0 },
      { label: 'Администраторов', value: 0 },
      { label: 'Организаций', value: 0 },
      { label: 'Тестируемых', value: 0 },
    ],
    charts: [
      { caption: 'Тестируемые по регионам', items: [] },
      { caption: 'Организации по регионам', items: [] },
    ],
    table: { caption: 'Регионы', columns: ['Регион', 'Организации', 'Админы области', 'Тестируемые'], rows: [] },
  })

  const region = await su('/api/admin/regions', { method: 'POST', json: { name: '  Мангыстауская   область ' } })
  assert.equal(region.status, 201)
  assert.deepEqual(Object.keys(region.body), ['id', 'name', 'createdAt'])
  assert.equal(region.body.name, 'Мангыстауская область')
  const regionId = region.body.id
  expectError(await su('/api/admin/regions', { method: 'POST', json: { name: 'МАНГЫСТАУСКАЯ ОБЛАСТЬ' } }), 409, 'Такой регион уже есть')
  expectError(await su('/api/admin/regions', { method: 'POST', json: { name: 'A' } }), 400, 'Название региона: от 2 до 80 символов')
  expectError(await su('/api/admin/regions', { method: 'POST' }), 400, 'Название региона: от 2 до 80 символов')
  const other = (await su('/api/admin/regions', { method: 'POST', json: { name: 'Атырауская область' } })).body
  const renamed = await su(`/api/admin/regions/${regionId}`, { method: 'PATCH', json: { name: 'Мангыстау' } })
  assert.equal(renamed.status, 200)
  assert.deepEqual(renamed.body, { id: regionId, name: 'Мангыстау', createdAt: region.body.createdAt })
  expectError(await su(`/api/admin/regions/${regionId}`, { method: 'PATCH', json: { name: 'Атырауская область' } }), 409, 'Такой регион уже есть')
  expectError(await su('/api/admin/regions/missing', { method: 'PATCH', json: { name: 'Новое' } }), 404, 'Регион не найден')
  assert.deepEqual((await su('/api/admin/regions')).body, {
    regions: [
      { id: other.id, name: 'Атырауская область', createdAt: other.createdAt, organizations: 0, admins: 0, learners: 0 },
      { id: regionId, name: 'Мангыстау', createdAt: region.body.createdAt, organizations: 0, admins: 0, learners: 0 },
    ],
  })

  const regional = await su('/api/admin/regional-admins', { method: 'POST', json: { login: 'mang', password: 'secret1', displayName: 'Айгуль', regionId } })
  assert.equal(regional.status, 201)
  assert.deepEqual(regional.body, {
    id: regional.body.id,
    login: 'mang',
    role: 'regional',
    displayName: 'Айгуль',
    regionId,
    regionName: 'Мангыстау',
    organizationId: null,
    organizationName: null,
    classId: null,
    className: null,
    classLabel: null,
    band: null,
  })
  expectError(await su('/api/admin/regional-admins', { method: 'POST', json: { login: 'MANG', password: 'secret1', displayName: 'Двойник', regionId } }), 409, 'Такой логин уже занят')
  expectError(await su('/api/admin/regional-admins', { method: 'POST', json: { login: 'ab', password: 'secret1', displayName: 'Имя', regionId } }), 400, 'Логин: 3–32 символа, буквы, цифры, точка, _ или -')
  expectError(await su('/api/admin/regional-admins', { method: 'POST', json: { login: 'abc', password: '123', displayName: 'Имя', regionId } }), 400, 'Пароль от 6 до 72 символов')
  expectError(await su('/api/admin/regional-admins', { method: 'POST', json: { login: 'abc', password: 'secret1', displayName: 'Имя', regionId: 'missing' } }), 404, 'Регион не найден')
  expectError(await su('/api/admin/regional-admins', { method: 'POST', json: { login: 'abc', password: 'secret1', displayName: 'И', regionId } }), 400, 'Имя: от 2 до 80 символов')
  assert.deepEqual((await su('/api/admin/regional-admins')).body, {
    admins: [{ id: regional.body.id, login: 'mang', displayName: 'Айгуль', regionId, regionName: 'Мангыстау' }],
  })

  const badPassword = await su(`/api/admin/regional-admins/${regional.body.id}`, { method: 'PATCH', json: { displayName: 'Айгуль Н.', regionId, password: '123' } })
  expectError(badPassword, 400, 'Пароль от 6 до 72 символов')
  assert.equal((await su('/api/admin/regional-admins')).body.admins[0].displayName, 'Айгуль Н.')
  const updatedRegional = await su(`/api/admin/regional-admins/${regional.body.id}`, { method: 'PATCH', json: { displayName: 'Айгуль', regionId, password: 'secret2' } })
  assert.equal(updatedRegional.status, 200)
  assert.equal(updatedRegional.body.displayName, 'Айгуль')
  expectError(await su('/api/admin/regional-admins/missing', { method: 'PATCH', json: { displayName: 'X Y', regionId } }), 404, 'Администратор не найден')
  const mang = as(await login(base, 'mang', 'secret2'))
  expectError(await mang('/api/admin/regions'), 403, 'Недостаточно прав')
  expectError(await mang('/api/admin/regional-admins'), 403, 'Недостаточно прав')

  const school = await mang('/api/admin/organizations', { method: 'POST', json: { name: 'Школа №3', groups: { grades_5_9: true, students: true } } })
  assert.equal(school.status, 201)
  assert.deepEqual(school.body, {
    id: school.body.id,
    regionId,
    name: 'Школа №3',
    groups: { grades_1_4: false, grades_5_9: true, grades_10_11: false, students: true },
    createdAt: school.body.createdAt,
  })
  const orgId = school.body.id
  expectError(await mang('/api/admin/organizations', { method: 'POST', json: { name: 'Школа №4' } }), 400, 'Отметьте хотя бы одну группу')
  expectError(await mang('/api/admin/organizations', { method: 'POST', json: { name: 'школа №3', groups: { grades_1_4: true } } }), 409, 'Такая организация в регионе уже есть')
  const flat = await mang('/api/admin/organizations', { method: 'POST', json: { name: 'Лицей', grades_10_11: true } })
  assert.equal(flat.status, 201)
  assert.equal(flat.body.groups.grades_10_11, true)
  const lyceum = flat.body.id
  const renamedOrg = await mang(`/api/admin/organizations/${lyceum}`, { method: 'PATCH', json: { name: 'Лицей №1', groups: { grades_10_11: true, grades_1_4: true } } })
  assert.equal(renamedOrg.body.name, 'Лицей №1')
  assert.equal(renamedOrg.body.groups.grades_1_4, true)
  expectError(await mang('/api/admin/organizations/missing', { method: 'PATCH', json: { name: 'Х', groups: {} } }), 404, 'Организация не найдена')
  expectError(await su('/api/admin/organizations'), 403, 'Недостаточно прав')
  expectError(await su(`/api/admin/regions/${regionId}`, { method: 'DELETE' }), 400, 'Сначала удалите организации и администраторов этого региона')

  const orgAdmin = await mang('/api/admin/org-admins', { method: 'POST', json: { login: 'school3', password: 'secret1', displayName: 'Мадина', organizationId: orgId } })
  assert.equal(orgAdmin.status, 201)
  assert.equal(orgAdmin.body.role, 'org')
  assert.equal(orgAdmin.body.organizationId, orgId)
  assert.equal(orgAdmin.body.organizationName, 'Школа №3')
  assert.equal(orgAdmin.body.regionId, null)
  expectError(await mang('/api/admin/org-admins', { method: 'POST', json: { login: 'x-admin', password: 'secret1', displayName: 'Мадина', organizationId: 'missing' } }), 404, 'Организация не найдена')
  expectError(await mang('/api/admin/org-admins', { method: 'POST', json: { login: '-admin', password: 'secret1', displayName: 'Мадина', organizationId: orgId } }), 400, 'Логин: 3–32 символа, буквы, цифры, точка, _ или -')
  assert.deepEqual((await mang('/api/admin/org-admins')).body, {
    admins: [{ id: orgAdmin.body.id, login: 'school3', displayName: 'Мадина', organizationId: orgId, organizationName: 'Школа №3' }],
  })
  const movedAdmin = await mang(`/api/admin/org-admins/${orgAdmin.body.id}`, { method: 'PATCH', json: { displayName: 'Мадина К.', organizationId: orgId, password: '' } })
  assert.equal(movedAdmin.body.displayName, 'Мадина К.')
  expectError(await mang('/api/admin/org-admins/missing', { method: 'PATCH', json: { displayName: 'Мадина', organizationId: orgId } }), 404, 'Администратор не найден')

  const listedOrgs = (await mang('/api/admin/organizations')).body.organizations
  assert.deepEqual(listedOrgs.map((org) => [org.name, org.classes, org.learners, org.admins]), [['Лицей №1', 0, 0, 0], ['Школа №3', 0, 0, 1]])
  assert.deepEqual(Object.keys(listedOrgs[0]), ['id', 'regionId', 'name', 'groups', 'createdAt', 'classes', 'learners', 'admins'])

  const org = as(await login(base, 'school3', 'secret1'))
  expectError(await org('/api/admin/organizations'), 403, 'Недостаточно прав')
  const tree = await org('/api/admin/structure')
  assert.equal(tree.status, 200)
  assert.deepEqual(tree.body.organization, school.body)
  assert.deepEqual(tree.body.sections, [
    {
      id: 'grades_5_9',
      label: '5–9 классы',
      kind: 'school',
      grades: [5, 6, 7, 8, 9].map((grade) => ({ grade, label: `${grade} класс`, classes: [] })),
    },
    { id: 'students', label: 'Студенты', kind: 'students', tracks: [] },
  ])

  const classA = await org('/api/admin/classes', { method: 'POST', json: { grade: 5, name: ' 5а ' } })
  assert.equal(classA.status, 201)
  assert.deepEqual(classA.body, { id: classA.body.id, name: '5а', band: 'grades_5_9', grade: 5 })
  expectError(await org('/api/admin/classes', { method: 'POST', json: { grade: 2, name: '2а' } }), 400, 'Эта группа в организации не отмечена')
  expectError(await org('/api/admin/classes', { method: 'POST', json: { grade: 13, name: '13а' } }), 400, 'Такой параллели нет')
  expectError(await org('/api/admin/classes', { method: 'POST', json: { grade: 5, name: '5А' } }), 409, 'Такой класс уже есть')
  expectError(await org('/api/admin/classes', { method: 'POST', json: { grade: 5, name: '' } }), 400, 'Название класса: от 1 до 20 символов')
  const classB = (await org('/api/admin/classes', { method: 'POST', json: { grade: 6, name: '5а' } })).body
  const track = await org('/api/admin/tracks', { method: 'POST', json: { name: '1 курс' } })
  assert.equal(track.status, 201)
  assert.deepEqual(track.body, { id: track.body.id, name: '1 курс' })
  expectError(await org('/api/admin/tracks', { method: 'POST', json: { name: '1 КУРС' } }), 409, 'Такой курс уже есть')
  const group = await org('/api/admin/classes', { method: 'POST', json: { trackId: track.body.id, name: 'ИС-21' } })
  assert.equal(group.status, 201)
  assert.deepEqual(group.body, { id: group.body.id, name: 'ИС-21', band: 'students', trackId: track.body.id })
  expectError(await org('/api/admin/classes', { method: 'POST', json: { trackId: 'missing', name: 'ИС-22' } }), 404, 'Курс не найден')
  assert.deepEqual((await org(`/api/admin/tracks/${track.body.id}`, { method: 'PATCH', json: { name: 'Первый курс' } })).body, { id: track.body.id, name: 'Первый курс' })
  expectError(await org('/api/admin/tracks/missing', { method: 'PATCH', json: { name: 'Курс' } }), 404, 'Курс не найден')
  assert.deepEqual((await org(`/api/admin/classes/${classB.id}`, { method: 'PATCH', json: { name: ' 5а ' } })).body, { id: classB.id, name: '5а' })
  expectError(await org('/api/admin/classes/missing', { method: 'PATCH', json: { name: '6б' } }), 404, 'Класс не найден')
  expectError(await org(`/api/admin/tracks/${track.body.id}`, { method: 'DELETE' }), 400, 'Сначала удалите группы этого курса')

  const filled = (await org('/api/admin/structure')).body.sections
  assert.deepEqual(filled[0].grades[0].classes, [{ id: classA.body.id, name: '5а', band: 'grades_5_9', grade: 5, trackId: null, learners: 0 }])
  assert.deepEqual(filled[1].tracks, [{ id: track.body.id, name: 'Первый курс', classes: [{ id: group.body.id, name: 'ИС-21', band: 'students', grade: null, trackId: track.body.id, learners: 0 }] }])

  const learner = await org('/api/admin/learners', { method: 'POST', json: { login: 'arman', password: 'secret1', displayName: 'Арман', classId: classA.body.id } })
  assert.equal(learner.status, 201)
  assert.deepEqual(learner.body, {
    id: learner.body.id,
    login: 'arman',
    role: 'learner',
    displayName: 'Арман',
    regionId: null,
    regionName: null,
    organizationId: orgId,
    organizationName: 'Школа №3',
    classId: classA.body.id,
    className: '5а',
    classLabel: '5а · 5 класс',
    band: 'grades_5_9',
  })
  expectError(await org('/api/admin/learners', { method: 'POST', json: { login: 'nobody', password: 'secret1', displayName: 'Нет', classId: 'missing' } }), 404, 'Класс не найден')
  expectError(await org('/api/admin/learners', { method: 'POST', json: { login: 'nobody', password: '12345', displayName: 'Нет', classId: classA.body.id } }), 400, 'Пароль от 6 до 72 символов')
  const student = (await org('/api/admin/learners', { method: 'POST', json: { login: 'aida', password: 'secret1', displayName: 'Аида', classId: group.body.id } })).body
  assert.equal(student.classLabel, 'ИС-21 · Первый курс')

  const page = await org('/api/admin/learners?limit=1')
  assert.deepEqual(page.body, {
    learners: [{ id: learner.body.id, login: 'arman', displayName: 'Арман', classId: classA.body.id, classLabel: '5а · 5 класс' }],
    total: 2,
    offset: 0,
    limit: 1,
  })
  assert.deepEqual((await org('/api/admin/learners?offset=1&limit=1')).body.learners.map((item) => item.login), ['aida'])
  assert.equal((await org('/api/admin/learners?search=AID')).body.total, 1)
  assert.equal((await org('/api/admin/learners?search=Арм')).body.total, 1)
  assert.equal((await org('/api/admin/learners?search=АИД')).body.total, 1)
  assert.equal((await org('/api/admin/learners?search=арм')).body.total, 1)
  const cyrillic = await org('/api/admin/learners', { method: 'POST', json: { login: 'Мирас', password: 'secret1', displayName: 'Мирас', classId: classA.body.id } })
  assert.equal(cyrillic.status, 201)
  expectError(await org('/api/admin/learners', { method: 'POST', json: { login: 'МИРАС', password: 'secret1', displayName: 'Двойник', classId: classA.body.id } }), 409, 'Такой логин уже занят')
  await login(base, 'мирас', 'secret1')
  assert.deepEqual((await org(`/api/admin/learners/${cyrillic.body.id}`, { method: 'DELETE' })).body, { ok: true })
  assert.deepEqual((await org(`/api/admin/learners?classId=${group.body.id}`)).body.learners.map((item) => item.login), ['aida'])
  assert.deepEqual((await org('/api/admin/learners?limit=9999&offset=-5')).body.limit, 500)
  assert.equal((await org('/api/admin/learners?limit=abc')).body.limit, 100)

  const moved = await org(`/api/admin/learners/${learner.body.id}`, { method: 'PATCH', json: { displayName: 'Арман С.', classId: group.body.id, password: '' } })
  assert.equal(moved.status, 200)
  assert.equal(moved.body.displayName, 'Арман С.')
  assert.equal(moved.body.classLabel, 'ИС-21 · Первый курс')
  expectError(await org('/api/admin/learners/missing', { method: 'PATCH', json: { displayName: 'Имя', classId: group.body.id } }), 404, 'Тестируемый не найден')

  const template = await org('/api/admin/learners/template')
  assert.equal(template.status, 200)
  assert.equal(template.headers.get('content-type'), XLSX)
  assert.equal(template.headers.get('content-disposition'), 'attachment; filename="testiruemye-shablon.xlsx"')
  const sample = new ExcelJS.Workbook()
  await sample.xlsx.load(template.buffer)
  assert.deepEqual(sample.worksheets[0].getRow(1).values.slice(1), ['Класс', 'Имя', 'Логин', 'Пароль'])
  expectError(await mang('/api/admin/learners/template'), 403, 'Недостаточно прав')

  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet('Тестируемые')
  sheet.addRow(['Класс', 'Имя', 'Логин', 'Пароль'])
  sheet.addRow(['5а · 5 класс', 'Дана Ким', 'dana.kim', 'secret9'])
  sheet.addRow(['5а', 'Двусмысленно', 'twice', 'secret9'])
  sheet.addRow(['ИС-21', 'Нурай', 'nuray', ''])
  sheet.addRow(['ИС-21', 'Арман второй', 'arman', 'secret9'])
  const upload = await org('/api/admin/learners/import', { method: 'POST', body: Buffer.from(await book.xlsx.writeBuffer()), headers: { 'Content-Type': 'application/octet-stream' } })
  assert.equal(upload.status, 200)
  assert.equal(upload.body.created, 2)
  assert.deepEqual(upload.body.learners.map(({ id, password, ...item }) => item), [
    { displayName: 'Дана Ким', login: 'dana.kim', classLabel: '5а · 5 класс' },
    { displayName: 'Нурай', login: 'nuray', classLabel: 'ИС-21 · Первый курс' },
  ])
  assert.equal(upload.body.learners[0].password, 'secret9')
  assert.match(upload.body.learners[1].password, /^[a-z0-9]{8}$/)
  assert.deepEqual(upload.body.errors, [
    'Строка 3: класс «5а» есть в нескольких параллелях, укажите «5а · 5 класс»',
    'Логин «arman» уже занят',
  ])
  expectError(await org('/api/admin/learners/import', { method: 'POST', body: Buffer.alloc(0), headers: { 'Content-Type': 'application/octet-stream' } }), 400, 'Файл пустой')
  expectError(await org('/api/admin/learners/import', { method: 'POST', body: Buffer.from('nope'), headers: { 'Content-Type': 'text/plain' } }), 400, 'Не удалось прочитать файл. Нужен Excel .xlsx')
  expectError(await mang('/api/admin/learners/import', { method: 'POST', body: Buffer.from('nope'), headers: { 'Content-Type': 'application/octet-stream' } }), 403, 'Недостаточно прав')
  assert.equal((await call(base, '/api/admin/learners/import', { method: 'POST', body: Buffer.from('nope') })).status, 401)
  assert.equal((await org('/api/admin/learners')).body.total, 4)

  const regionStats = (await mang('/api/admin/dashboard')).body
  assert.equal(regionStats.scope, 'region')
  assert.equal(regionStats.title, 'Мангыстау')
  assert.deepEqual(regionStats.cards, [
    { label: 'Организаций', value: 2 },
    { label: 'Администраторов', value: 1 },
    { label: 'Классов', value: 3 },
    { label: 'Тестируемых', value: 4 },
  ])
  assert.deepEqual(regionStats.charts.map((chart) => chart.caption), ['Тестируемые по организациям', 'Тестируемые по группам', 'Тестируемые по параллелям'])
  assert.deepEqual(regionStats.charts[1].items, [
    { key: 'grades_1_4', label: '1–4 классы', value: 0 },
    { key: 'grades_5_9', label: '5–9 классы', value: 1 },
    { key: 'grades_10_11', label: '10–11 классы', value: 0 },
    { key: 'students', label: 'Студенты', value: 3 },
  ])
  assert.deepEqual(regionStats.charts[2].items, [
    { key: 'grade:5', label: '5 класс', value: 1 },
    { key: 'grade:6', label: '6 класс', value: 0 },
    { key: 'track:Первый курс', label: 'Первый курс', value: 3 },
  ])
  assert.deepEqual(regionStats.table.rows.map((row) => row.cells), [['Лицей №1', 0, 0, 0], ['Школа №3', 3, 4, 1]])

  const orgStats = (await org('/api/admin/dashboard')).body
  assert.equal(orgStats.scope, 'organization')
  assert.deepEqual(orgStats.cards, [
    { label: 'Классов', value: 3 },
    { label: 'Тестируемых', value: 4 },
    { label: 'Групп', value: 2 },
    { label: 'Администраторов', value: 1 },
  ])
  assert.deepEqual(orgStats.table.rows.map((row) => row.cells), [['5а', '5 класс', 1], ['5а', '6 класс', 0], ['ИС-21', 'Первый курс', 3]])
  assert.deepEqual(orgStats.charts[0].items.map((item) => [item.label, item.value]), [['ИС-21', 3], ['5а', 1], ['5а', 0]])

  const platform = (await su('/api/admin/dashboard')).body
  assert.deepEqual(platform.cards.map((card) => card.value), [2, 1, 2, 4])
  assert.deepEqual(platform.table.rows.map((row) => row.cells), [['Атырауская область', 0, 0, 0], ['Мангыстау', 2, 1, 4]])
  assert.deepEqual(platform.charts[0].items, [{ key: regionId, label: 'Мангыстау', value: 4 }, { key: other.id, label: 'Атырауская область', value: 0 }])

  const pupil = as(await login(base, 'dana.kim', 'secret9'))
  expectError(await pupil('/api/admin/structure'), 403, 'Недостаточно прав')
  expectError(await pupil('/api/admin/dashboard'), 403, 'Недостаточно прав')

  expectError(await org(`/api/admin/classes/${group.body.id}`, { method: 'DELETE' }), 400, 'В классе есть тестируемые. Сначала переведите или удалите их')
  expectError(await mang(`/api/admin/organizations/${orgId}`, { method: 'DELETE' }), 400, 'Сначала удалите администраторов, классы и тестируемых')
  for (const item of (await org('/api/admin/learners')).body.learners) {
    assert.deepEqual((await org(`/api/admin/learners/${item.id}`, { method: 'DELETE' })).body, { ok: true })
  }
  expectError(await org(`/api/admin/learners/${learner.body.id}`, { method: 'DELETE' }), 404, 'Тестируемый не найден')
  assert.deepEqual((await org(`/api/admin/classes/${group.body.id}`, { method: 'DELETE' })).body, { ok: true })
  expectError(await org('/api/admin/classes/missing', { method: 'DELETE' }), 404, 'Класс не найден')
  assert.deepEqual((await org(`/api/admin/tracks/${track.body.id}`, { method: 'DELETE' })).body, { ok: true })
  expectError(await org(`/api/admin/tracks/${track.body.id}`, { method: 'DELETE' }), 404, 'Курс не найден')
  expectError(await mang(`/api/admin/organizations/${orgId}`, { method: 'PATCH', json: { name: 'Школа №3', groups: { grades_10_11: true } } }), 400, 'Нельзя снять группу, в которой уже есть классы')
  for (const id of [classA.body.id, classB.id]) await org(`/api/admin/classes/${id}`, { method: 'DELETE' })
  assert.deepEqual((await mang(`/api/admin/org-admins/${orgAdmin.body.id}`, { method: 'DELETE' })).body, { ok: true })
  expectError(await mang(`/api/admin/org-admins/${orgAdmin.body.id}`, { method: 'DELETE' }), 404, 'Администратор не найден')
  assert.deepEqual((await mang(`/api/admin/organizations/${orgId}`, { method: 'DELETE' })).body, { ok: true })
  assert.deepEqual((await mang(`/api/admin/organizations/${lyceum}`, { method: 'DELETE' })).body, { ok: true })
  expectError(await mang(`/api/admin/organizations/${lyceum}`, { method: 'DELETE' }), 404, 'Организация не найдена')
  assert.deepEqual((await su(`/api/admin/regional-admins/${regional.body.id}`, { method: 'DELETE' })).body, { ok: true })
  expectError(await su(`/api/admin/regional-admins/${regional.body.id}`, { method: 'DELETE' }), 404, 'Администратор не найден')
  assert.deepEqual((await su(`/api/admin/regions/${regionId}`, { method: 'DELETE' })).body, { ok: true })
  expectError(await su(`/api/admin/regions/${regionId}`, { method: 'DELETE' }), 404, 'Регион не найден')
  assert.deepEqual((await su('/api/admin/regions')).body.regions.map((item) => item.name), ['Атырауская область'])
})
