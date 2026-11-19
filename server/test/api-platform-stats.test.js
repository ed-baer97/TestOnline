import assert from 'node:assert/strict'
import test from 'node:test'
import { createHost, useTestDatabase } from './helpers/db.js'
import { call, login, startServer } from './helpers/http.js'

await useTestDatabase('api-platform-stats')
process.env.SESSION_SECRET = 'test-secret'
process.env.SUPER_LOGIN = 'root'
process.env.SUPER_PASSWORD = 'rootpass'

function expectError(response, status, error) {
  assert.equal(response.status, status, `${error}: ${response.text}`)
  assert.deepEqual(response.body, { error })
}

test('двуязычные регионы, районы, каталог Мангистау, platform-stats и org-stats', async (t) => {
  const server = await startServer()
  t.after(() => server.close())
  const { base } = server
  const suCookie = await login(base, 'root', 'rootpass')
  const su = (path, options = {}) => call(base, path, { ...options, cookie: suCookie })
  const as = (cookie) => (path, options = {}) => call(base, path, { ...options, cookie })

  // 1. Создание и обновление региона с nameKk
  const createdMang = await su('/api/admin/regions', {
    method: 'POST',
    json: { name: 'Мангыстауская область', nameKk: 'Маңғыстау облысы' },
  })
  assert.equal(createdMang.status, 201)
  assert.equal(createdMang.body.nameKk, 'Маңғыстау облысы')
  const mangRegionId = createdMang.body.id

  const createdOther = await su('/api/admin/regions', {
    method: 'POST',
    json: { name: 'Атырауская область' },
  })
  assert.equal(createdOther.status, 201)
  const otherRegionId = createdOther.body.id

  const updatedOther = await su(`/api/admin/regions/${otherRegionId}`, {
    method: 'PATCH',
    json: { name: 'Атырауская область', nameKk: 'Атырау облысы' },
  })
  assert.equal(updatedOther.status, 200)
  assert.equal(updatedOther.body.nameKk, 'Атырау облысы')

  const regionList = await su('/api/admin/regions')
  assert.equal(regionList.status, 200)
  assert.deepEqual(
    regionList.body.regions.map((item) => [item.name, item.nameKk]),
    [
      ['Атырауская область', 'Атырау облысы'],
      ['Мангыстауская область', 'Маңғыстау облысы'],
    ],
  )

  // 2. Админы регионов и организаций
  const regAdmin = await su('/api/admin/regional-admins', {
    method: 'POST',
    json: { login: 'reg.mang', password: 'secret1', displayName: 'Админ Мангистау', regionId: mangRegionId },
  })
  assert.equal(regAdmin.status, 201)
  const regOtherAdmin = await su('/api/admin/regional-admins', {
    method: 'POST',
    json: { login: 'reg.other', password: 'secret1', displayName: 'Админ Атырау', regionId: otherRegionId },
  })
  assert.equal(regOtherAdmin.status, 201)

  const regMang = as(await login(base, 'reg.mang', 'secret1'))
  const regOther = as(await login(base, 'reg.other', 'secret1'))

  // 3. Районы (super с ?regionId и regional в своём регионе) + запрет удаления района со школами
  const district = await regOther('/api/admin/districts', {
    method: 'POST',
    json: { name: 'Курмангазинский район', nameKk: 'Құрманғазы ауданы' },
  })
  assert.equal(district.status, 201)
  assert.deepEqual(district.body, {
    id: district.body.id,
    name: 'Курмангазинский район',
    nameKk: 'Құрманғазы ауданы',
  })

  const superDistricts = await su(`/api/admin/districts?regionId=${otherRegionId}`)
  assert.equal(superDistricts.status, 200)
  assert.equal(superDistricts.body.districts.length, 1)
  assert.equal(superDistricts.body.districts[0].name, 'Курмангазинский район')

  const schoolInOther = await regOther('/api/admin/organizations', {
    method: 'POST',
    json: {
      name: 'Школа имени Абая',
      nameKk: 'Абай атындағы мектеп',
      districtId: district.body.id,
      groups: { grades_5_9: true },
    },
  })
  assert.equal(schoolInOther.status, 201)
  const otherOrgId = schoolInOther.body.id

  expectError(
    await regOther(`/api/admin/districts/${district.body.id}`, { method: 'DELETE' }),
    400,
    'Сначала удалите школы этого района',
  )

  const emptyDistrict = await regOther('/api/admin/districts', {
    method: 'POST',
    json: { name: 'Пустой район', nameKk: 'Бос аудан' },
  })
  assert.equal(emptyDistrict.status, 201)
  const delEmpty = await regOther(`/api/admin/districts/${emptyDistrict.body.id}`, { method: 'DELETE' })
  assert.equal(delEmpty.status, 200)

  // 4. Каталог Мангистау: не-Мангистау -> 400; Мангистау -> 7 районов и >100 школ; повтор -> already: true
  expectError(
    await su('/api/admin/catalog', { method: 'POST', json: { regionId: otherRegionId } }),
    400,
    'Каталог школ есть для Мангистауской области',
  )
  const seeded = await regMang('/api/admin/catalog', { method: 'POST', json: {} })
  assert.equal(seeded.status, 200)
  assert.equal(seeded.body.ok, true)
  assert.equal(seeded.body.already, false)
  assert.equal(seeded.body.districts, 7)
  assert.ok(seeded.body.schools > 100)

  const reseeded = await su('/api/admin/catalog', { method: 'POST', json: { regionId: mangRegionId } })
  assert.equal(reseeded.status, 200)
  assert.equal(reseeded.body.already, true)

  // 5. platform-stats: фильтрация публичных квизов (личный квиз ведущего не утекает; квиз суперглавного виден)
  await createHost('personal.host', 'secret1')
  const hostCookie = await login(base, 'personal.host', 'secret1')
  const hostQuiz = await call(base, '/api/quizzes', {
    method: 'POST',
    cookie: hostCookie,
    json: {
      title: 'Личный квиз ведущего (секретный)',
      questions: [{ text: '2+2?', timeLimit: 20, correctIndex: 0, options: [{ text: '4' }, { text: '5' }] }],
    },
  })
  assert.equal(hostQuiz.status, 201)

  const superQuiz = await su('/api/quizzes', {
    method: 'POST',
    json: {
      title: 'Общий квиз платформы',
      questions: [{ text: 'Столица Казахстана?', timeLimit: 20, correctIndex: 0, options: [{ text: 'Астана' }, { text: 'Алматы' }] }],
    },
  })
  assert.equal(superQuiz.status, 201)

  const statsCatalog = await su('/api/admin/platform-stats')
  assert.equal(statsCatalog.status, 200)
  assert.equal(statsCatalog.body.scope, 'platform')
  assert.equal(statsCatalog.body.regions.length, 2)

  const statsSuperRegion = await su(`/api/admin/platform-stats?regionId=${mangRegionId}`)
  assert.equal(statsSuperRegion.status, 200)
  assert.equal(statsSuperRegion.body.scope, 'region')
  assert.equal(statsSuperRegion.body.districts.length, 7)
  assert.ok(statsSuperRegion.body.organizations.length > 100)

  const publicTitles = statsSuperRegion.body.publicQuizzes.map((item) => item.title)
  assert.equal(publicTitles.includes('Общий квиз платформы'), true)
  assert.equal(publicTitles.includes('Личный квиз ведущего (секретный)'), false)

  const statsRegional = await regMang('/api/admin/platform-stats')
  assert.equal(statsRegional.status, 200)
  assert.equal(statsRegional.body.title, 'Мангыстауская область')

  // 6. Организация, org-stats и разграничение прав
  const orgAdmin = await regOther('/api/admin/org-admins', {
    method: 'POST',
    json: { login: 'org.abay', password: 'secret1', displayName: 'Админ Абая', organizationId: otherOrgId },
  })
  assert.equal(orgAdmin.status, 201)
  const orgClient = as(await login(base, 'org.abay', 'secret1'))

  expectError(await orgClient('/api/admin/platform-stats'), 403, 'Недостаточно прав')

  const ownOrgStats = await orgClient('/api/admin/org-stats')
  assert.equal(ownOrgStats.status, 200)
  assert.equal(ownOrgStats.body.scope, 'organization')
  assert.equal(ownOrgStats.body.title, 'Школа имени Абая')
  assert.equal(ownOrgStats.body.titleKk, 'Абай атындағы мектеп')

  const regOwnOrgStats = await regOther(`/api/admin/org-stats?organizationId=${otherOrgId}`)
  assert.equal(regOwnOrgStats.status, 200)

  expectError(
    await regMang(`/api/admin/org-stats?organizationId=${otherOrgId}`),
    404,
    'Организация не найдена',
  )

  const superOrgStats = await su(`/api/admin/org-stats?organizationId=${otherOrgId}`)
  assert.equal(superOrgStats.status, 200)
  assert.equal(superOrgStats.body.title, 'Школа имени Абая')
})
