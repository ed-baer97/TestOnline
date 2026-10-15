import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import ExcelJS from 'exceljs'
import { questionsFromXlsx, templateWorkbook } from './excel.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'testonline-excel-'))
process.env.MEDIA_DIR = path.join(dir, 'media')
process.env.PG_SCHEMA = `t_${crypto.randomBytes(4).toString('hex')}`
process.env.SESSION_SECRET = 'test-secret'

test.after(async () => {
  const { closeDatabase } = await import('./db.js')
  await closeDatabase()
})

function fill(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: argb }
}

async function workbook(rows) {
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet('Вопросы')
  for (const item of rows) {
    const row = sheet.addRow(item.values)
    for (const [col, color] of Object.entries(item.fills || {})) {
      row.getCell(Number(col)).fill = fill(color)
    }
  }
  return book.xlsx.writeBuffer()
}

test('жёлтая ячейка становится правильным ответом, белая нет', async () => {
  const buffer = await workbook([
    {
      values: ['Столица Франции?', 'Париж', 'Рим', 'Берлин', 'Мадрид'],
      fills: {
        2: { argb: 'FFFFFF00' },
        3: { argb: 'FFFFFFFF' },
      },
    },
    { values: [] },
    {
      values: ['Сколько будет 7 × 8?', 56, '54', '64'],
      fills: { 3: { theme: 4, tint: 0.2 } },
    },
  ])
  const questions = await questionsFromXlsx(buffer)
  assert.equal(questions.length, 2)
  assert.equal(questions[0].correctIndex, 0)
  assert.equal(questions[0].options[0].text, 'Париж')
  assert.equal(questions[0].timeLimit, 20)
  assert.equal(questions[1].text, 'Сколько будет 7 × 8?')
  assert.equal(questions[1].options[0].text, '56')
  assert.equal(questions[1].correctIndex, 1)
})

test('строка заголовка «Вопрос» без заливки пропускается', async () => {
  const buffer = await workbook([
    { values: ['Вопрос', 'А', 'Б', 'В'] },
    {
      values: ['Цвет неба?', '', 'Синий', 'Зелёный'],
      fills: { 3: { indexed: 5 } },
    },
  ])
  const questions = await questionsFromXlsx(buffer)
  assert.equal(questions.length, 1)
  assert.deepEqual(questions[0].options.map((option) => option.text), ['Синий', 'Зелёный'])
  assert.equal(questions[0].correctIndex, 0)
})

test('вариант длиннее 80 символов принимается, длиннее 400 — нет', async () => {
  const long = 'Отказаться, отойти и сразу рассказать родителям или учителю, даже если он кажется добрым'
  assert.ok(long.length > 80)
  assert.ok(long.length <= 400)
  const buffer = await workbook([{
    values: ['Что делать?', long, 'Согласиться'],
    fills: { 2: { argb: 'FFFFFF00' } },
  }])
  const questions = await questionsFromXlsx(buffer)
  assert.equal(questions[0].options[0].text, long)

  const huge = await workbook([{
    values: ['Что делать?', 'А'.repeat(401), 'Согласиться'],
    fills: { 2: { argb: 'FFFFFF00' } },
  }])
  await assert.rejects(questionsFromXlsx(huge), /Строка 1: вариант длиннее 400/)
})

test('без цветного ответа, с двумя цветами и с лишним вариантом файл отклоняется', async () => {
  const plain = await workbook([{ values: ['Два плюс два?', '4', '5'] }])
  await assert.rejects(questionsFromXlsx(plain), /отличным от белого/)

  const white = await workbook([{
    values: ['Два плюс два?', '4', '5'],
    fills: { 2: { argb: 'FFFFFFFF' }, 3: { theme: 0 } },
  }])
  await assert.rejects(questionsFromXlsx(white), /Строка 1: залейте/)

  const both = await workbook([{
    values: ['Два плюс два?', '4', '5'],
    fills: { 2: { argb: 'FF00FF00' }, 3: { argb: 'FFFF0000' } },
  }])
  await assert.rejects(questionsFromXlsx(both), /только один/)

  const tooMany = await workbook([{
    values: ['Два плюс два?', '4', '5', '3', '22', '0'],
    fills: { 2: { argb: 'FFFFFF00' } },
  }])
  await assert.rejects(questionsFromXlsx(tooMany), /от 2 до 4/)
})

test('шаблон Excel читается как квиз с жёлтым правильным ответом', async () => {
  const questions = await questionsFromXlsx(await templateWorkbook())
  assert.equal(questions.length, 2)
  assert.equal(questions[0].text, 'Столица Франции?')
  assert.equal(questions[0].correctIndex, 0)
  assert.equal(questions[0].options[0].text, 'Париж')
  assert.equal(questions[1].correctIndex, 0)
})

test('импорт через API доступен после входа', async () => {
  const { createApp } = await import('./index.js')
  const { httpServer } = createApp()
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${httpServer.address().port}`
  try {
    const { registerUser } = await import('./db.js')
    await registerUser({ login: 'importer', password: 'secret1' })
    const register = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'importer', password: 'secret1' }),
    })
    assert.equal(register.status, 200)
    const cookie = register.headers.get('set-cookie').split(';')[0]
    const buffer = await workbook([{
      values: ['Столица Франции?', 'Париж', 'Рим'],
      fills: { 2: { argb: 'FFFFC000' } },
    }])
    const denied = await fetch(`${base}/api/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buffer,
    })
    assert.equal(denied.status, 401)
    const imported = await fetch(`${base}/api/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', Cookie: cookie },
      body: buffer,
    })
    assert.equal(imported.status, 200)
    const data = await imported.json()
    assert.equal(data.questions[0].options[0].text, 'Париж')
    assert.equal(data.questions[0].correctIndex, 0)
  } finally {
    httpServer.close()
  }
})
