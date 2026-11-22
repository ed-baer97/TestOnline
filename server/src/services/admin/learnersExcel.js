import crypto from 'node:crypto'
import { assertRole } from '../../domain/access.js'
import { allocateUniqueLogin, generatePassword, loginBaseFromName, normalizeAccount, parseFioLines } from '../../domain/accounts.js'
import { fail } from '../../domain/errors.js'
import { classCaption } from '../../domain/structure.js'
import { cleanText } from '../../domain/text.js'
import { hashPassword } from '../../infrastructure/passwords.js'
import * as classesRepo from '../../repositories/classes.js'
import * as usersRepo from '../../repositories/users.js'
import { classInOrg, mustOrg, resolveTargetOrgId } from './scope.js'

export async function learnersTemplate(mode = 'full') {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Тестируемые')
  if (mode === 'fio') {
    sheet.columns = [{ header: 'ФИО', width: 38 }]
    sheet.addRow(['Иванов Иван Иванович'])
    sheet.addRow(['Қасымова Аида Серікқызы'])
  } else {
    sheet.columns = [
      { header: 'Класс', width: 18 },
      { header: 'Имя', width: 32 },
      { header: 'Логин', width: 22 },
      { header: 'Пароль', width: 18 },
    ]
    sheet.addRow(['5а', 'Арман Сериков', '', ''])
    sheet.addRow(['5а', 'Аида Нурланова', 'aida.n', ''])
  }
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

const RE_CLASS = /^(класс|группа|сынып|топ|class|group)$/i
const RE_LAST = /^(фамилия|тегі|surname|last\s*name)$/i
const RE_FIRST = /^(имя|аты|есімі?|first\s*name)$/i
const RE_MIDDLE = /^(отчество|әкесінің\s+аты|patronymic|middle\s*name)$/i
const RE_FIO = /^(ф\.?\s*и\.?\s*о\.?|имя|фамилия\s+и\s+имя|фамилия\s+имя(?:\s+отчество)?|ученик|студент|тестируемый|участник|аты[\s-]*жөні|толық\s+аты[\s-]*жөні|есімі?|name|full\s*name)$/i
const RE_LOGIN = /^(логин|login|username)$/i
const RE_PASS = /^(пароль|құпия\s*сөз|password)$/i
const RE_INDEX = /^(№|#|n|no|п\/п|№\s*п\/п|рет\s*саны)$/i

function collectRows(sheet) {
  const items = []
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const maxCol = Math.max(row.cellCount || 0, 8)
    const cells = []
    let hasValue = false
    for (let col = 1; col <= maxCol; col += 1) {
      const text = cellText(row.getCell(col).value)
      cells[col] = text
      if (text) hasValue = true
    }
    if (hasValue) items.push({ number: row.number, cells })
  })
  return items
}

function detectColumns(rawRows, hasDefaultClass) {
  const first = rawRows[0]
  let classCol = null
  let fioCol = null
  let lastCol = null
  let firstCol = null
  let middleCol = null
  let loginCol = null
  let passCol = null

  for (let col = 1; col < first.cells.length; col += 1) {
    const text = first.cells[col]
    if (!text || RE_INDEX.test(text)) continue
    if (!classCol && RE_CLASS.test(text)) classCol = col
    else if (!lastCol && RE_LAST.test(text)) lastCol = col
    else if (!firstCol && RE_FIRST.test(text)) firstCol = col
    else if (!middleCol && RE_MIDDLE.test(text)) middleCol = col
    else if (!fioCol && RE_FIO.test(text)) fioCol = col
    else if (!loginCol && RE_LOGIN.test(text)) loginCol = col
    else if (!passCol && RE_PASS.test(text)) passCol = col
  }

  const isHeader = Boolean(classCol || fioCol || lastCol || loginCol || passCol)
  if (isHeader) {
    if (lastCol) {
      fioCol = null
    } else if (!fioCol && firstCol) {
      fioCol = firstCol
      firstCol = null
    }
    if (!fioCol && !lastCol) fail('В файле не найден столбец с ФИО')
    if (!classCol && !hasDefaultClass) fail('Выберите класс или добавьте столбец «Класс» в файл')
    return {
      headerRowNumber: first.number,
      classCol,
      fioCol,
      lastCol,
      firstCol,
      middleCol,
      loginCol,
      passCol,
    }
  }

  if (hasDefaultClass) {
    const onlyCol1 = rawRows.every((row) => Boolean(row.cells[1]) && row.cells.slice(2).every((v) => !v))
    if (onlyCol1) {
      return { headerRowNumber: null, classCol: null, fioCol: 1, lastCol: null, firstCol: null, middleCol: null, loginCol: null, passCol: null }
    }
    const indexedCol2 = rawRows.every((row) => /^\d+\.?$/.test(row.cells[1] || '') && Boolean(row.cells[2]) && row.cells.slice(3).every((v) => !v))
    if (indexedCol2) {
      return { headerRowNumber: null, classCol: null, fioCol: 2, lastCol: null, firstCol: null, middleCol: null, loginCol: null, passCol: null }
    }
  }

  return { headerRowNumber: null, classCol: 1, fioCol: 2, lastCol: null, firstCol: null, middleCol: null, loginCol: 3, passCol: 4 }
}

function readRowName(cells, columns) {
  if (columns.lastCol) {
    return cleanText([
      cells[columns.lastCol],
      columns.firstCol ? cells[columns.firstCol] : '',
      columns.middleCol ? cells[columns.middleCol] : '',
    ].filter(Boolean).join(' '))
  }
  return cleanText(columns.fioCol ? cells[columns.fioCol] : '')
}

async function insertAutoLearnerWithRetry(row, passwordHash, createdAt, organizationId, reserved) {
  const id = crypto.randomUUID()
  try {
    await usersRepo.insertLearner({
      id,
      login: row.login,
      passwordHash,
      createdAt,
      displayName: row.displayName,
      organizationId,
      classId: row.klass.id,
    })
    return { id, displayName: row.displayName, login: row.login, password: row.password, classLabel: row.klass.label }
  } catch (error) {
    if (!usersRepo.isLoginTaken(error)) throw error
  }

  const freshTaken = await usersRepo.findTakenLoginsByPrefixes([row.loginBase])
  for (const item of freshTaken) reserved.add(item)

  for (let retry = 0; retry < 5; retry += 1) {
    const candidateBase = retry >= 3
      ? `${row.loginBase.slice(0, 22).replace(/\.+$/, '')}${crypto.randomInt(1000, 10000)}`
      : row.loginBase
    const nextLogin = allocateUniqueLogin(candidateBase, reserved)
    const nextId = crypto.randomUUID()
    try {
      await usersRepo.insertLearner({
        id: nextId,
        login: nextLogin,
        passwordHash,
        createdAt,
        displayName: row.displayName,
        organizationId,
        classId: row.klass.id,
      })
      return { id: nextId, displayName: row.displayName, login: nextLogin, password: row.password, classLabel: row.klass.label }
    } catch (inner) {
      if (!usersRepo.isLoginTaken(inner) || retry === 4) throw inner
    }
  }
  return null
}

async function insertLearnerBatch(organizationId, rows, errors, emptyMessage = 'В файле нет тестируемых') {
  if (rows.length > 5000) fail('За один раз можно загрузить до 5000 тестируемых')
  if (!rows.length) {
    if (errors.length) return { created: 0, learners: [], errors }
    fail(emptyMessage)
  }

  const explicitLower = []
  const autoBases = []
  const baseCount = new Map()
  for (const row of rows) {
    if (row.autoLogin) {
      autoBases.push(row.loginBase)
      baseCount.set(row.loginBase, (baseCount.get(row.loginBase) || 0) + 1)
    } else {
      explicitLower.push(row.login.toLowerCase())
    }
  }

  const taken = await usersRepo.findTakenLogins([...new Set([...explicitLower, ...autoBases])])
  const reserved = new Set(taken)
  for (const row of rows) {
    if (row.autoLogin) continue
    const lower = row.login.toLowerCase()
    if (taken.has(lower)) {
      row.rejected = true
      errors.push(`Логин «${row.login}» уже занят`)
    } else {
      reserved.add(lower)
    }
  }

  const prefixBases = [...new Set(autoBases.filter((base) => reserved.has(base) || (baseCount.get(base) || 0) > 1))]
  if (prefixBases.length) {
    const prefixTaken = await usersRepo.findTakenLoginsByPrefixes(prefixBases)
    for (const item of prefixTaken) reserved.add(item)
  }

  const fresh = []
  for (const row of rows) {
    if (row.rejected) continue
    if (row.autoLogin) row.login = allocateUniqueLogin(row.loginBase, reserved)
    fresh.push(row)
  }

  const created = []
  const now = new Date().toISOString()
  for (let start = 0; start < fresh.length; start += 100) {
    const chunk = fresh.slice(start, start + 100)
    const hashes = await Promise.all(chunk.map((row) => hashPassword(row.password)))
    const batch = []
    chunk.forEach((row, index) => {
      const id = crypto.randomUUID()
      batch.push({ id, login: row.login, passwordHash: hashes[index], createdAt: now, displayName: row.displayName, organizationId, classId: row.klass.id })
      created.push({ id, displayName: row.displayName, login: row.login, password: row.password, classLabel: row.klass.label })
    })
    try {
      await usersRepo.insertLearners(batch)
    } catch (error) {
      if (!usersRepo.isLoginTaken(error)) throw error
      // Кто-то занял логин между проверкой и вставкой: пачку повторяем по одному.
      created.splice(created.length - chunk.length, chunk.length)
      for (const [index, row] of chunk.entries()) {
        if (row.autoLogin) {
          const item = await insertAutoLearnerWithRetry(row, hashes[index], now, organizationId, reserved)
          if (item) created.push(item)
          continue
        }
        const id = crypto.randomUUID()
        try {
          await usersRepo.insertLearner({ id, login: row.login, passwordHash: hashes[index], createdAt: now, displayName: row.displayName, organizationId, classId: row.klass.id })
          created.push({ id, displayName: row.displayName, login: row.login, password: row.password, classLabel: row.klass.label })
        } catch (inner) {
          if (!usersRepo.isLoginTaken(inner)) throw inner
          errors.push(`Логин «${row.login}» уже занят`)
        }
      }
    }
  }
  return { created: created.length, learners: created, errors }
}

export async function importLearners(actor, buffer, options = {}) {
  const organizationId = await resolveTargetOrgId(actor, options?.organizationId)
  if (!Buffer.isBuffer(buffer) || !buffer.length) fail('Файл пустой')
  const bytes = buffer
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(bytes)
  } catch {
    fail('Не удалось прочитать файл. Нужен Excel .xlsx')
  }
  const sheet = workbook.worksheets[0]
  if (!sheet) fail('В файле нет листа')

  const org = await mustOrg(organizationId)
  const classes = (await classesRepo.listClassesWithTracks(organizationId))
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

  let defaultClass = null
  if (options?.classId) {
    const found = await classInOrg(options.classId, organizationId)
    defaultClass = { ...found, label: classCaption(found) }
  }

  const rawRows = collectRows(sheet)
  if (!rawRows.length) fail('В файле нет тестируемых')
  const columns = detectColumns(rawRows, Boolean(defaultClass))

  const rows = []
  const errors = []
  const seenLogins = new Set()
  for (const row of rawRows) {
    if (row.number === columns.headerRowNumber) continue
    const className = columns.classCol ? (row.cells[columns.classCol] || '') : ''
    const displayName = readRowName(row.cells, columns)
    const rawLogin = columns.loginCol ? (row.cells[columns.loginCol] || '') : ''
    const rawPassword = columns.passCol ? (row.cells[columns.passCol] || '') : ''
    if (!className && !displayName && !rawLogin && !rawPassword) continue
    const label = `Строка ${row.number}`

    let klass
    if (className) {
      const matches = byName.get(className.toLowerCase()) || []
      if (!matches.length) {
        errors.push(`${label}: класс «${className}» не найден`)
        continue
      }
      if (matches.length > 1) {
        errors.push(`${label}: класс «${className}» есть в нескольких параллелях, укажите «${matches[0].label}»`)
        continue
      }
      klass = matches[0]
    } else if (defaultClass) {
      klass = defaultClass
    } else {
      errors.push(`${label}: не указан класс`)
      continue
    }

    if (displayName.length < 2 || displayName.length > 80) {
      errors.push(`${label}: имя от 2 до 80 символов`)
      continue
    }

    if (rawPassword && (rawPassword.length < 6 || rawPassword.length > 72)) {
      errors.push(`${label}: Пароль от 6 до 72 символов`)
      continue
    }
    const password = rawPassword || generatePassword()

    if (rawLogin) {
      let account
      try {
        account = normalizeAccount({ login: rawLogin, password })
      } catch (error) {
        errors.push(`${label}: ${error.message}`)
        continue
      }
      const lower = account.login.toLowerCase()
      if (seenLogins.has(lower)) {
        errors.push(`${label}: логин «${account.login}» повторяется в файле`)
        continue
      }
      seenLogins.add(lower)
      rows.push({ autoLogin: false, klass, displayName, login: account.login, loginBase: null, password: account.password })
    } else {
      rows.push({ autoLogin: true, klass, displayName, login: null, loginBase: loginBaseFromName(displayName), password })
    }
  }

  return insertLearnerBatch(organizationId, rows, errors)
}

export async function importLearnersList(actor, input) {
  const organizationId = await resolveTargetOrgId(actor, input?.organizationId)
  const klassRow = await classInOrg(input?.classId, organizationId)
  const klass = { ...klassRow, label: classCaption(klassRow) }
  const source = Array.isArray(input?.names) ? input.names : String(input?.text || '')
  const lines = parseFioLines(source)
  if (lines.length > 5000) fail('За один раз можно загрузить до 5000 тестируемых')
  if (!lines.length) fail('Введите хотя бы одно ФИО')

  const rows = []
  const errors = []
  for (const line of lines) {
    if (line.displayName.length < 2 || line.displayName.length > 80) {
      errors.push(`Строка ${line.lineNumber}: имя от 2 до 80 символов`)
      continue
    }
    rows.push({
      autoLogin: true,
      klass,
      displayName: line.displayName,
      login: null,
      loginBase: loginBaseFromName(line.displayName),
      password: generatePassword(),
    })
  }
  return insertLearnerBatch(organizationId, rows, errors, 'Введите хотя бы одно ФИО')
}

function safeExcelText(value) {
  const text = cleanText(value)
  return /^[=+\-@]/.test(text) ? `'${text}` : text
}

export async function exportLearnersWorkbook(actor, input) {
  assertRole(actor, 'org', 'super')
  const list = input?.learners
  if (!Array.isArray(list) || !list.length) fail('Список для выгрузки пуст')
  if (list.length > 5000) fail('За один раз можно выгрузить до 5000 строк')
  const kk = input?.lang === 'kk'
  const orgName = cleanText(input?.organizationName)
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(kk ? 'Логиндер мен құпия сөздер' : 'Логины и пароли')
  const columns = []
  if (orgName) columns.push({ header: kk ? 'Ұйым' : 'Организация', width: 32 })
  columns.push(
    { header: kk ? 'Сынып' : 'Класс', width: 22 },
    { header: kk ? 'Аты-жөні' : 'ФИО', width: 34 },
    { header: 'Логин', width: 24 },
    { header: kk ? 'Құпия сөз' : 'Пароль', width: 18 },
  )
  sheet.columns = columns

  const loginCol = orgName ? 4 : 3
  const passCol = orgName ? 5 : 4
  for (const item of list) {
    const values = []
    if (orgName) values.push(safeExcelText(orgName))
    values.push(
      safeExcelText(item?.classLabel || ''),
      safeExcelText(item?.displayName || ''),
      cleanText(item?.login || ''),
      String(item?.password ?? ''),
    )
    const row = sheet.addRow(values)
    row.getCell(loginCol).numFmt = '@'
    row.getCell(passCol).numFmt = '@'
  }
  sheet.getRow(1).font = { bold: true }
  return workbook.xlsx.writeBuffer()
}
