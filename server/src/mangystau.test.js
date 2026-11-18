import assert from 'node:assert/strict'
import test from 'node:test'
import { MANGYSTAU_DISTRICTS, MANGYSTAU_REGION } from './mangystau.js'

test('справочник Мангыстау: два языка, районы и уникальные школы', () => {
  assert.equal(MANGYSTAU_REGION.name, 'Мангыстауская область')
  assert.equal(MANGYSTAU_REGION.nameKk, 'Маңғыстау облысы')
  assert.deepEqual(MANGYSTAU_DISTRICTS.map((district) => district.name), [
    'Бейнеуский район',
    'Каракиянский район',
    'Мангистауский район',
    'Мунайлинский район',
    'Тупкараганский район',
    'город Актау',
    'город Жанаозен',
  ])
  const schools = MANGYSTAU_DISTRICTS.flatMap((district) => district.schools)
  assert.ok(schools.length > 100)
  const names = schools.map((school) => school.name.toLocaleLowerCase('ru'))
  const namesKk = schools.map((school) => school.nameKk.toLocaleLowerCase('kk'))
  assert.equal(new Set(names).size, names.length)
  assert.equal(new Set(namesKk).size, namesKk.length)
  for (const school of schools) {
    assert.ok(school.name.length >= 2 && school.name.length <= 120, school.name)
    assert.ok(school.nameKk.length >= 2 && school.nameKk.length <= 120, school.nameKk)
    assert.ok(['school', 'primary', 'evening'].includes(school.kind))
  }
  for (const district of MANGYSTAU_DISTRICTS) {
    assert.ok(district.nameKk.length >= 2 && district.nameKk.length <= 80)
    assert.ok(district.schools.length > 0)
  }
})
