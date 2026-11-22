import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'
import { exportLearnersWorkbook, learnersTemplate } from '../src/services/admin/learnersExcel.js'

test('шаблоны Excel для полного импорта и списка ФИО', async () => {
  const fullBook = new ExcelJS.Workbook()
  await fullBook.xlsx.load(await learnersTemplate())
  assert.deepEqual(fullBook.worksheets[0].getRow(1).values.slice(1), ['Класс', 'Имя', 'Логин', 'Пароль'])

  const fioBook = new ExcelJS.Workbook()
  await fioBook.xlsx.load(await learnersTemplate('fio'))
  assert.deepEqual(fioBook.worksheets[0].getRow(1).values.slice(1), ['ФИО'])
  assert.equal(fioBook.worksheets[0].getRow(2).getCell(1).value, 'Иванов Иван Иванович')
  assert.equal(fioBook.worksheets[0].getRow(3).getCell(1).value, 'Қасымова Аида Серікқызы')
})

test('выгрузка логинов и паролей в Excel: RU/KK, организация, защита от формул и текстовый формат', async () => {
  const superActor = { id: 'su', role: 'super' }
  const orgActor = { id: 'org1', role: 'org', organizationId: 'o1' }
  const regionalActor = { id: 'reg1', role: 'regional', regionId: 'r1' }

  await assert.rejects(() => exportLearnersWorkbook(regionalActor, { learners: [{ login: 'a', password: '123' }] }), (err) => err.status === 403)
  await assert.rejects(() => exportLearnersWorkbook(orgActor, { learners: [] }), /Список для выгрузки пуст/)
  await assert.rejects(
    () => exportLearnersWorkbook(superActor, { learners: Array.from({ length: 5001 }, () => ({ login: 'a', password: 'b' })) }),
    /до 5000/,
  )

  const ruBuf = await exportLearnersWorkbook(superActor, {
    lang: 'ru',
    organizationName: 'Школа №3',
    learners: [
      { classLabel: '5а · 5 класс', displayName: '=SUM(1,2)', login: 'sum.test', password: 'abc12345' },
      { classLabel: '+Группа', displayName: 'Аида К.', login: 'aida.k', password: '00123456' },
    ],
  })
  const ruBook = new ExcelJS.Workbook()
  await ruBook.xlsx.load(ruBuf)
  const ruSheet = ruBook.worksheets[0]
  assert.equal(ruSheet.name, 'Логины и пароли')
  assert.deepEqual(ruSheet.getRow(1).values.slice(1), ['Организация', 'Класс', 'ФИО', 'Логин', 'Пароль'])
  assert.equal(ruSheet.getRow(2).getCell(3).value, "'=SUM(1,2)")
  assert.equal(ruSheet.getRow(3).getCell(2).value, "'+Группа")
  assert.equal(ruSheet.getRow(3).getCell(4).numFmt, '@')
  assert.equal(ruSheet.getRow(3).getCell(5).numFmt, '@')
  assert.equal(ruSheet.getRow(3).getCell(5).value, '00123456')

  const kkBuf = await exportLearnersWorkbook(orgActor, {
    lang: 'kk',
    learners: [{ classLabel: '5а · 5-сынып', displayName: 'Аида К.', login: 'aida.k', password: 'secret12' }],
  })
  const kkBook = new ExcelJS.Workbook()
  await kkBook.xlsx.load(kkBuf)
  const kkSheet = kkBook.worksheets[0]
  assert.equal(kkSheet.name, 'Логиндер мен құпия сөздер')
  assert.deepEqual(kkSheet.getRow(1).values.slice(1), ['Сынып', 'Аты-жөні', 'Логин', 'Құпия сөз'])
  assert.equal(kkSheet.getRow(2).getCell(3).numFmt, '@')
  assert.equal(kkSheet.getRow(2).getCell(4).numFmt, '@')
})
