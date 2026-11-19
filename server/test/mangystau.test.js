import assert from 'node:assert/strict'
import test from 'node:test'
import { MANGYSTAU_DISTRICTS, MANGYSTAU_REGION, isMangystau } from '../src/domain/mangystau.js'

test('справочник Мангистауской области: районы, школы и двуязычные названия', () => {
  assert.ok(MANGYSTAU_REGION.name.length >= 2)
  assert.ok(MANGYSTAU_REGION.nameKk.length >= 2)
  assert.equal(MANGYSTAU_DISTRICTS.length, 7)

  const districtNames = new Set()
  const districtNamesKk = new Set()
  let totalSchools = 0

  for (const [index, district] of MANGYSTAU_DISTRICTS.entries()) {
    assert.equal(district.order, index + 1)
    assert.ok(district.name && district.name.length <= 80)
    assert.ok(district.nameKk && district.nameKk.length <= 80)
    assert.equal(districtNames.has(district.name), false, `дубль района: ${district.name}`)
    assert.equal(districtNamesKk.has(district.nameKk), false, `дубль района kk: ${district.nameKk}`)
    districtNames.add(district.name)
    districtNamesKk.add(district.nameKk)

    assert.ok(Array.isArray(district.schools) && district.schools.length > 0)
    const schoolNames = new Set()
    for (const school of district.schools) {
      assert.ok(school.name.length >= 2 && school.name.length <= 160, school.name)
      assert.ok(school.nameKk.length >= 2 && school.nameKk.length <= 160, school.nameKk)
      assert.ok(['school', 'primary', 'evening'].includes(school.kind), `${school.name}: ${school.kind}`)
      assert.equal(schoolNames.has(school.name), false, `дубль школы в ${district.name}: ${school.name}`)
      schoolNames.add(school.name)
      totalSchools += 1
    }
  }

  assert.ok(totalSchools > 100, `ожидалось больше 100 школ, получено ${totalSchools}`)
})

test('распознавание Мангистауской области на русском и казахском', () => {
  assert.equal(isMangystau('Мангыстауская область'), true)
  assert.equal(isMangystau('Мангистауская область'), true)
  assert.equal(isMangystau('Маңғыстау облысы'), true)
  assert.equal(isMangystau('Область', 'Маңғыстау облысы'), true)
  assert.equal(isMangystau('Атырауская область'), false)
  assert.equal(isMangystau(''), false)
  assert.equal(isMangystau(null), false)
})
