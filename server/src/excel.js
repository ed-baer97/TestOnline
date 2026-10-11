import crypto from 'node:crypto'
import ExcelJS from 'exceljs'
import { appError } from './domain/errors.js'

const THEME = ['FFFFFF', '000000', 'E7E6E6', '44546A', '5B9BD5', 'ED7D31', 'A9D08E', 'FFC000', '4472C4', '70AD47']
const INDEXED = [
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080',
  '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF',
  '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF',
  '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
  '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696',
  '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333',
]

function clean(value) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\u0000-\u001F]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
}

function cellText(value) {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return clean(value)
  if (value instanceof Date) return clean(value.toLocaleDateString('ru-RU'))
  if (Array.isArray(value.richText)) return clean(value.richText.map((part) => part.text || '').join(''))
  if (value.result != null) return cellText(value.result)
  if (typeof value.text === 'string') return clean(value.text)
  return ''
}

function rgbOf(hex) {
  const value = String(hex || '').replace(/^#/, '')
  const rgb = value.length === 8 ? value.slice(2) : value
  if (!/^[0-9A-Fa-f]{6}$/.test(rgb)) return null
  return {
    r: Number.parseInt(rgb.slice(0, 2), 16),
    g: Number.parseInt(rgb.slice(2, 4), 16),
    b: Number.parseInt(rgb.slice(4, 6), 16),
  }
}

function tintChannel(channel, tint) {
  if (tint < 0) return Math.round(channel * (1 + tint))
  return Math.round(channel * (1 - tint) + 255 * tint)
}

function paint(color) {
  if (!color || color.indexed === 64 || color.indexed === 65) return null
  if (color.argb || color.rgb) return rgbOf(color.argb || color.rgb)
  if (typeof color.theme === 'number') {
    const base = rgbOf(THEME[color.theme]) || { r: 0, g: 0, b: 255 }
    if (!color.tint) return base
    const tint = Math.min(1, Math.max(-1, color.tint))
    return {
      r: tintChannel(base.r, tint),
      g: tintChannel(base.g, tint),
      b: tintChannel(base.b, tint),
    }
  }
  if (typeof color.indexed === 'number') return rgbOf(INDEXED[color.indexed]) || { r: 0, g: 0, b: 255 }
  return null
}

function isWhite(rgb) {
  return rgb.r >= 250 && rgb.g >= 250 && rgb.b >= 250
}

export function isHighlighted(cell) {
  const fill = cell?.fill
  if (!fill) return false
  if (fill.type === 'pattern' && (!fill.pattern || fill.pattern === 'none')) return false
  if (fill.type === 'gradient') return true
  const rgb = paint(fill.fgColor) || paint(fill.bgColor)
  if (!rgb) return false
  return !isWhite(rgb)
}

export async function templateWorkbook() {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Вопросы')
  sheet.columns = [
    { header: 'Вопрос', width: 42 },
    { header: 'Вариант 1', width: 24 },
    { header: 'Вариант 2', width: 24 },
    { header: 'Вариант 3', width: 24 },
    { header: 'Вариант 4', width: 28 },
  ]
  const yellow = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
  const samples = [
    ['Столица Франции?', 'Париж', 'Рим', 'Берлин', 'Мадрид'],
    ['Сколько будет 7 × 8?', '56', '54', '64', '48'],
  ]
  for (const values of samples) {
    const row = sheet.addRow(values)
    row.getCell(2).fill = yellow
  }
  sheet.getRow(1).font = { bold: true }
  return workbook.xlsx.writeBuffer()
}

export async function questionsFromXlsx(buffer) {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer)
  } catch {
    throw appError('Не удалось прочитать файл. Нужен Excel .xlsx')
  }
  const sheet = workbook.worksheets[0]
  if (!sheet) throw appError('В файле нет листа')

  const questions = []
  let headerSkipped = false
  sheet.eachRow({ includeEmpty: false }, (row) => {
    if (questions.length > 50) return
    const text = cellText(row.getCell(1).value)
    const options = []
    let correctIndex = -1
    let marks = 0
    const last = Math.min(Math.max(row.cellCount, 1), 8)
    for (let col = 2; col <= last; col += 1) {
      const cell = row.getCell(col)
      const optionText = cellText(cell.value)
      if (!optionText) continue
      if (isHighlighted(cell)) {
        marks += 1
        correctIndex = options.length
      }
      options.push({ text: optionText })
    }
    if (!text && options.length === 0) return
    if (!headerSkipped && questions.length === 0 && /^(вопрос|question)$/i.test(text) && marks === 0) {
      headerSkipped = true
      return
    }
    const label = `Строка ${row.number}`
    if (text.length < 2 || text.length > 200) throw appError(`${label}: вопрос от 2 до 200 символов`)
    if (options.length < 2 || options.length > 4) throw appError(`${label}: нужно от 2 до 4 вариантов`)
    if (options.some((option) => option.text.length > 80)) throw appError(`${label}: вариант длиннее 80 символов`)
    if (marks === 0) throw appError(`${label}: залейте правильный ответ цветом, отличным от белого`)
    if (marks > 1) throw appError(`${label}: цветом можно отметить только один ответ`)
    questions.push({
      id: crypto.randomUUID(),
      text,
      timeLimit: 20,
      options,
      correctIndex,
    })
  })

  if (questions.length < 1) throw appError('В файле нет вопросов')
  if (questions.length > 50) throw appError('Максимум 50 вопросов')
  return questions
}
