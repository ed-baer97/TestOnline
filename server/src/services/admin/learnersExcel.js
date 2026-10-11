import crypto from 'node:crypto'
import { assertRole } from '../../domain/access.js'
import { generatePassword, normalizeAccount } from '../../domain/accounts.js'
import { fail } from '../../domain/errors.js'
import { classCaption } from '../../domain/structure.js'
import { cleanText } from '../../domain/text.js'
import { isUniqueViolation } from '../../infrastructure/db/index.js'
import { hashPassword } from '../../infrastructure/passwords.js'
import * as classesRepo from '../../repositories/classes.js'
import * as usersRepo from '../../repositories/users.js'
import { mustOrg } from './scope.js'

export async function learnersTemplate() {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Тестируемые')
  sheet.columns = [
    { header: 'Класс', width: 18 },
    { header: 'Имя', width: 32 },
    { header: 'Логин', width: 22 },
    { header: 'Пароль', width: 18 },
  ]
  sheet.addRow(['5а', 'Арман Сериков', 'arman.serikov', 'qwe123'])
  sheet.addRow(['5а', 'Аида Нурланова', 'aida.n', ''])
  sheet.getRow(1).font = { bold: true }
  return workbook.xlsx.writeBuffer()
}
function cellText(value) {
  if (value == null) return ''
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return cleanText(value.richText.map((part) => part.text || '').join(''))
    if (value.result != null) return cellText(value.result)
    if (typeof value.text === 'string') return cleanText(value.text)
    return ''
  }
  return cleanText(value)
}
export async function importLearners(actor, buffer) {
  assertRole(actor, 'org')
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || [])
  if (!bytes.length) fail('Файл пустой')
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(bytes)
  } catch {
    fail('Не удалось прочитать файл. Нужен Excel .xlsx')
  }
  const sheet = workbook.worksheets[0]
  if (!sheet) fail('В файле нет листа')

  const org = await mustOrg(actor.organizationId)
  const classes = (await classesRepo.listClassesWithTracks(actor.organizationId))
    .map((row) => ({ ...row, label: classCaption(row) }))
    .filter((item) => org.groups[item.band])
  const byName = new Map()
  for (const item of classes) {
    for (const key of [item.class_name, item.label]) {
      const lower = key.toLowerCase()
      if (!byName.has(lower)) byName.set(lower, [])
      byName.get(lower).push(item)
    }
  }

  const rows = []
  const errors = []
  const seenLogins = new Set()
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const className = cellText(row.getCell(1).value)
    const displayName = cellText(row.getCell(2).value)
    const login = cellText(row.getCell(3).value)
    const password = cellText(row.getCell(4).value)
    if (!className && !displayName && !login) return
    if (row.number === 1 && /^класс$/i.test(className)) return
    const label = `Строка ${row.number}`
    const matches = byName.get(className.toLowerCase()) || []
    if (!matches.length) {
      errors.push(`${label}: класс «${className}» не найден`)
      return
    }
    if (matches.length > 1) {
      errors.push(`${label}: класс «${className}» есть в нескольких параллелях, укажите «${matches[0].label}»`)
      return
    }
    if (displayName.length < 2 || displayName.length > 80) {
      errors.push(`${label}: имя от 2 до 80 символов`)
      return
    }
    let account
    try {
      account = normalizeAccount({ login, password: password || generatePassword() })
    } catch (error) {
      errors.push(`${label}: ${error.message}`)
      return
    }
    const lower = account.login.toLowerCase()
    if (seenLogins.has(lower)) {
      errors.push(`${label}: логин «${account.login}» повторяется в файле`)
      return
    }
    seenLogins.add(lower)
    rows.push({ klass: matches[0], displayName, login: account.login, password: account.password })
  })
  if (rows.length > 5000) fail('За один раз можно загрузить до 5000 тестируемых')
  if (!rows.length) {
    if (errors.length) return { created: 0, learners: [], errors }
    fail('В файле нет тестируемых')
  }

  const taken = await usersRepo.findTakenLogins(rows.map((row) => row.login.toLowerCase()))
  const fresh = []
  for (const row of rows) {
    if (taken.has(row.login.toLowerCase())) errors.push(`Логин «${row.login}» уже занят`)
    else fresh.push(row)
  }

  const created = []
  const now = new Date().toISOString()
  for (let start = 0; start < fresh.length; start += 100) {
    const chunk = fresh.slice(start, start + 100)
    const hashes = await Promise.all(chunk.map((row) => hashPassword(row.password)))
    const batch = []
    chunk.forEach((row, index) => {
      const id = crypto.randomUUID()
      batch.push({ id, login: row.login, passwordHash: hashes[index], createdAt: now, displayName: row.displayName, organizationId: actor.organizationId, classId: row.klass.id })
      created.push({ id, displayName: row.displayName, login: row.login, password: row.password, classLabel: row.klass.label })
    })
    try {
      await usersRepo.insertLearners(batch)
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      // Кто-то занял логин между проверкой и вставкой: пачку повторяем по одному.
      created.splice(created.length - chunk.length, chunk.length)
      for (const [index, row] of chunk.entries()) {
        const id = crypto.randomUUID()
        try {
          await usersRepo.insertLearner({ id, login: row.login, passwordHash: hashes[index], createdAt: now, displayName: row.displayName, organizationId: actor.organizationId, classId: row.klass.id })
          created.push({ id, displayName: row.displayName, login: row.login, password: row.password, classLabel: row.klass.label })
        } catch (inner) {
          if (!isUniqueViolation(inner)) throw inner
          errors.push(`Логин «${row.login}» уже занят`)
        }
      }
    }
  }
  return { created: created.length, learners: created, errors }
}
