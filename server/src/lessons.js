import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from './db.js'
import {
  GROUP_KEYS,
  assertRole,
  clean,
  cleanLabel,
  fail,
  groupNumbers,
  mapGroups,
  optionalLabel,
  readGroups,
  readLang,
} from './domain.js'
import { slidesFromPptx } from './pptx.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg'])
const MAX_VIDEO = 80 * 1024 * 1024
const MAX_IMAGE = 1_500_000
const UUID = /^[0-9a-f-]{36}$/i

const TONES = ['sun', 'orbit', 'planets', 'earth']
const DEMO_KEY = 'solar-system'

function attemptLimit() {
  const value = Number(process.env.LESSON_MAX_ATTEMPTS)
  return Number.isInteger(value) && value > 0 ? value : 1
}

const DEMO_SLIDES = [
  {
    id: 'sun',
    kind: 'frame',
    tone: 'sun',
    kicker: 'Слайд 1',
    title: 'Солнечная система',
    lines: [
      'Вокруг Солнца движутся восемь планет.',
      'Они удерживаются его притяжением и светят отражённым светом.',
    ],
  },
  {
    id: 'center',
    kind: 'frame',
    tone: 'orbit',
    kicker: 'Слайд 2',
    title: 'Звезда в центре',
    lines: [
      'Солнце — звезда, а не планета.',
      'Оно даёт планетам свет и тепло.',
    ],
  },
  {
    id: 'order',
    kind: 'frame',
    tone: 'planets',
    kicker: 'Слайд 3',
    title: 'Порядок планет',
    lines: [
      'От Солнца: Меркурий, Венера, Земля, Марс.',
      'Дальше: Юпитер, Сатурн, Уран и Нептун.',
    ],
  },
  {
    id: 'earth',
    kind: 'frame',
    tone: 'earth',
    kicker: 'Слайд 4',
    title: 'Наша планета',
    lines: [
      'Земля — третья планета от Солнца.',
      'На ней есть вода и воздух, поэтому здесь живут люди, животные и растения.',
    ],
  },
]

const DEMO_SLIDES_KK = [
  {
    id: 'sun',
    kind: 'frame',
    tone: 'sun',
    kicker: '1-слайд',
    title: 'Күн жүйесі',
    lines: [
      'Күннің айналасында сегіз ғаламшар қозғалады.',
      'Оларды Күннің тартылысы ұстап тұрады, олар шағылған жарықпен жарқырайды.',
    ],
  },
  {
    id: 'center',
    kind: 'frame',
    tone: 'orbit',
    kicker: '2-слайд',
    title: 'Ортадағы жұлдыз',
    lines: [
      'Күн — ғаламшар емес, жұлдыз.',
      'Ол ғаламшарларға жарық пен жылу береді.',
    ],
  },
  {
    id: 'order',
    kind: 'frame',
    tone: 'planets',
    kicker: '3-слайд',
    title: 'Ғаламшарлар реті',
    lines: [
      'Күннен бастап: Меркурий, Шолпан, Жер, Марс.',
      'Әрі қарай: Юпитер, Сатурн, Уран және Нептун.',
    ],
  },
  {
    id: 'earth',
    kind: 'frame',
    tone: 'earth',
    kicker: '4-слайд',
    title: 'Біздің ғаламшар',
    lines: [
      'Жер — Күннен үшінші ғаламшар.',
      'Онда су мен ауа бар, сондықтан мұнда адамдар, жануарлар және өсімдіктер тіршілік етеді.',
    ],
  },
]

const DEMO_QUESTIONS_KK = [
  {
    id: 'planets',
    text: 'Күннің айналасында неше ғаламшар айналады?',
    options: [{ text: '8' }, { text: '7' }, { text: '9' }, { text: '10' }],
    correctIndex: 0,
  },
  {
    id: 'center',
    text: 'Күн жүйесінің ортасында не бар?',
    options: [{ text: 'Күн' }, { text: 'Жер' }, { text: 'Ай' }, { text: 'Марс' }],
    correctIndex: 0,
  },
  {
    id: 'third',
    text: 'Күннен үшінші ғаламшар қайсысы?',
    options: [{ text: 'Жер' }, { text: 'Шолпан' }, { text: 'Марс' }, { text: 'Юпитер' }],
    correctIndex: 0,
  },
  {
    id: 'closest',
    text: 'Күнге ең жақын ғаламшар қайсысы?',
    options: [{ text: 'Меркурий' }, { text: 'Шолпан' }, { text: 'Жер' }, { text: 'Марс' }],
    correctIndex: 0,
  },
]

const DEMO_QUESTIONS = [
  {
    id: 'planets',
    text: 'Сколько планет вращается вокруг Солнца?',
    options: [{ text: '8' }, { text: '7' }, { text: '9' }, { text: '10' }],
    correctIndex: 0,
  },
  {
    id: 'center',
    text: 'Что находится в центре Солнечной системы?',
    options: [{ text: 'Солнце' }, { text: 'Земля' }, { text: 'Луна' }, { text: 'Марс' }],
    correctIndex: 0,
  },
  {
    id: 'third',
    text: 'Какая планета третья от Солнца?',
    options: [{ text: 'Земля' }, { text: 'Венера' }, { text: 'Марс' }, { text: 'Юпитер' }],
    correctIndex: 0,
  },
  {
    id: 'closest',
    text: 'Какая планета ближе всех к Солнцу?',
    options: [{ text: 'Меркурий' }, { text: 'Венера' }, { text: 'Жемля'.replace('Ж', 'З') }, { text: 'Марс' }],
    correctIndex: 0,
  },
]

async function fillDemoKazakh(id) {
  await db.run(
    'UPDATE lessons SET title_kk = ?, slides_kk = ?, questions_kk = ? WHERE id = ? AND (slides_kk IS NULL OR slides_kk = ? OR slides_kk = ?)',
    'Күн жүйесі',
    JSON.stringify(DEMO_SLIDES_KK),
    JSON.stringify(DEMO_QUESTIONS_KK),
    id,
    '',
    '[]',
  )
}

export async function ensureDemoLesson() {
  const existing = await db.get('SELECT id FROM lessons WHERE seed_key = ?', DEMO_KEY)
  if (existing) {
    await fillDemoKazakh(existing.id)
    return existing.id
  }
  const count = await db.get('SELECT COUNT(*) AS n FROM lessons')
  if (Number(count?.n || 0) > 0) return null
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  await db.run(
    `INSERT INTO lessons (
      id, title, title_kk, seed_key, grades_1_4, grades_5_9, grades_10_11, students, slides, questions, slides_kk, questions_kk, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 0, 1, 0, 0, ?, ?, ?, ?, ?, ?)`,
    id,
    'Солнечная система',
    'Күн жүйесі',
    DEMO_KEY,
    JSON.stringify(DEMO_SLIDES),
    JSON.stringify(DEMO_QUESTIONS),
    JSON.stringify(DEMO_SLIDES_KK),
    JSON.stringify(DEMO_QUESTIONS_KK),
    now,
    now,
  )
  return id
}

// Файлы слайдов и видео лежат на диске. Раньше картинки хранились в lesson_files.data_base64;
// при старте такие строки один раз переносятся на диск, колонка остаётся пустой.

function mediaRoot() {
  if (process.env.MEDIA_DIR) return path.resolve(process.env.MEDIA_DIR)
  return path.join(__dirname, '..', 'data', 'media')
}

function filesRoot() {
  return path.join(mediaRoot(), 'files')
}

function filePath(fileId) {
  if (!UUID.test(String(fileId || ''))) fail('Файл не найден', 404)
  return path.join(filesRoot(), fileId)
}

function fileUrl(fileId) {
  return `/api/lessons/files/${fileId}`
}

async function storeFile(lessonId, mime, bytes) {
  const id = crypto.randomUUID()
  await fs.promises.mkdir(filesRoot(), { recursive: true })
  await fs.promises.writeFile(filePath(id), bytes)
  await db.run('INSERT INTO lesson_files (id, lesson_id, mime, data_base64) VALUES (?, ?, ?, ?)', id, lessonId, mime, '')
  return id
}

async function dropFiles(ids) {
  for (const id of ids) {
    if (UUID.test(String(id))) await fs.promises.rm(filePath(id), { force: true })
    await db.run('DELETE FROM lesson_files WHERE id = ?', id)
  }
}

async function dropLessonFiles(lessonId) {
  const rows = await db.all('SELECT id FROM lesson_files WHERE lesson_id = ?', lessonId)
  await dropFiles(rows.map((row) => row.id))
}

export async function migrateLessonFiles() {
  const rows = await db.all("SELECT id FROM lesson_files WHERE data_base64 <> ''")
  if (!rows.length) return 0
  await fs.promises.mkdir(filesRoot(), { recursive: true })
  let moved = 0
  for (const { id } of rows) {
    if (!UUID.test(String(id))) continue
    const row = await db.get('SELECT data_base64 FROM lesson_files WHERE id = ?', id)
    if (!row?.data_base64) continue
    await fs.promises.writeFile(filePath(id), Buffer.from(row.data_base64, 'base64'))
    await db.run("UPDATE lesson_files SET data_base64 = '' WHERE id = ?", id)
    moved += 1
  }
  return moved
}

async function learnerBand(actor) {
  if (actor.band && GROUP_KEYS.includes(actor.band)) return actor.band
  const row = await db.get('SELECT band FROM classes WHERE id = ?', actor.classId)
  if (!row?.band || !GROUP_KEYS.includes(row.band)) fail('Класс тестируемого не найден', 404)
  return row.band
}

async function canSee(actor, row) {
  if (actor.role === 'super') return true
  if (actor.role !== 'learner') return false
  const band = await learnerBand(actor)
  return Boolean(row[band])
}

function lessonFormat(row) {
  return row.format === 'video' ? 'video' : 'slides'
}

function parseList(value) {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function summary(row, best, section = null) {
  return {
    id: row.id,
    title: row.title,
    titleKk: row.title_kk || '',
    format: lessonFormat(row),
    groups: mapGroups(row),
    section,
    slideCount: parseList(row.slides).length,
    slideCountKk: parseList(row.slides_kk).length,
    questionCount: parseList(row.questions).length,
    questionCountKk: parseList(row.questions_kk).length,
    hasVideoKk: Boolean(row.video_mime_kk),
    best: best ? { score: Number(best.score), total: Number(best.total) } : null,
  }
}

function videoOf(row, lang) {
  const updatedAt = row.updated_at || ''
  if (lang === 'kk' && row.video_mime_kk) return { name: row.video_name_kk || 'video', mime: row.video_mime_kk, lang: 'kk', updatedAt }
  if (row.video_mime) return { name: row.video_name || 'video', mime: row.video_mime, lang: 'ru', updatedAt }
  if (row.video_mime_kk) return { name: row.video_name_kk || 'video', mime: row.video_mime_kk, lang: 'kk', updatedAt }
  return null
}

function selectPack(row, lang) {
  const ru = {
    lang: 'ru',
    title: row.title,
    slides: parseList(row.slides),
    questions: parseList(row.questions),
  }
  const kkSlides = parseList(row.slides_kk)
  const kkQuestions = parseList(row.questions_kk)
  const kkReady = Boolean(row.title_kk || kkSlides.length || kkQuestions.length || row.video_mime_kk)
  if (readLang(lang) === 'kk' && kkReady) {
    return {
      lang: 'kk',
      title: row.title_kk || row.title,
      slides: kkSlides.length ? kkSlides : ru.slides,
      questions: kkQuestions.length ? kkQuestions : ru.questions,
    }
  }
  return ru
}

async function bestAttempts(userId) {
  const rows = await db.all(
    `SELECT lesson_id, score, total FROM lesson_attempts
     WHERE user_id = ? ORDER BY score DESC, finished_at DESC`,
    userId,
  )
  const best = new Map()
  for (const row of rows) if (!best.has(row.lesson_id)) best.set(row.lesson_id, row)
  return best
}

const SECTION_FIELDS = 'id, name, name_kk, sort_order, grades_1_4, grades_5_9, grades_10_11, students'

function sameText(left, right) {
  return left.localeCompare(right, 'ru', { sensitivity: 'accent' }) === 0
}

function mapSection(row) {
  return {
    id: row.id,
    name: row.name,
    nameKk: row.name_kk || '',
    sortOrder: Number(row.sort_order),
    groups: mapGroups(row),
  }
}

async function sectionMap() {
  const rows = await db.all(
    `SELECT p.lesson_id, s.${SECTION_FIELDS.split(', ').join(', s.')}
     FROM lesson_section_lessons p
     JOIN lesson_sections s ON s.id = p.section_id`,
  )
  const map = new Map()
  for (const row of rows) {
    if (!map.has(row.lesson_id)) map.set(row.lesson_id, mapSection(row))
  }
  return map
}

async function sectionOfLesson(lessonId) {
  const map = await sectionMap()
  return map.get(lessonId) || null
}

export async function ensureLessonSections() {
  await db.tx(async (tx) => {
    const band = await tx.get(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'lesson_sections' AND column_name = 'band'`,
    )
    if (band) {
      await tx.run('ALTER TABLE lesson_sections ALTER COLUMN band DROP NOT NULL')
      for (const key of GROUP_KEYS) {
        await tx.run(
          `UPDATE lesson_sections SET ${key} = 1
           WHERE band = ? AND grades_1_4 = 0 AND grades_5_9 = 0 AND grades_10_11 = 0 AND students = 0`,
          key,
        )
      }
    }
    const done = await tx.get('SELECT key FROM app_seeds WHERE key = ?', 'lesson-sections-v2')
    if (done) return
    const seeded = await tx.all(
      `SELECT id FROM lesson_sections WHERE name = ? AND COALESCE(name_kk, '') = ?`,
      'Уроки',
      'Сабақтар',
    )
    for (const section of seeded) {
      await tx.run('DELETE FROM lesson_section_lessons WHERE section_id = ?', section.id)
      await tx.run('DELETE FROM lesson_sections WHERE id = ?', section.id)
    }
    const dupes = await tx.all(
      'SELECT lesson_id FROM lesson_section_lessons GROUP BY lesson_id HAVING COUNT(*) > 1',
    )
    for (const row of dupes) {
      const keep = await tx.get(
        `SELECT p.section_id FROM lesson_section_lessons p
         JOIN lesson_sections s ON s.id = p.section_id
         WHERE p.lesson_id = ?
         ORDER BY s.sort_order, s.name
         LIMIT 1`,
        row.lesson_id,
      )
      await tx.run(
        'DELETE FROM lesson_section_lessons WHERE lesson_id = ? AND section_id <> ?',
        row.lesson_id,
        keep.section_id,
      )
    }
    const placed = await tx.all(
      `SELECT p.lesson_id, s.grades_1_4, s.grades_5_9, s.grades_10_11, s.students
       FROM lesson_section_lessons p
       JOIN lesson_sections s ON s.id = p.section_id`,
    )
    for (const row of placed) {
      await tx.run(
        'UPDATE lessons SET grades_1_4 = ?, grades_5_9 = ?, grades_10_11 = ?, students = ? WHERE id = ?',
        row.grades_1_4,
        row.grades_5_9,
        row.grades_10_11,
        row.students,
        row.lesson_id,
      )
    }
    await tx.run('INSERT INTO app_seeds (key, applied_at) VALUES (?, ?)', 'lesson-sections-v2', new Date().toISOString())
  })
}

async function loadSection(id) {
  const row = await db.get(`SELECT ${SECTION_FIELDS} FROM lesson_sections WHERE id = ?`, id)
  return row ? mapSection(row) : null
}

async function assertSectionNameFree(name, nameKk, exceptId = '') {
  const rows = await db.all('SELECT id, name, name_kk FROM lesson_sections')
  if (rows.some((row) => row.id !== exceptId && (sameText(row.name, name) || (nameKk && row.name_kk && sameText(row.name_kk, nameKk))))) {
    fail('Такой раздел уже есть', 409)
  }
}

async function placeLesson(lessonId, sectionId) {
  await db.tx(async (tx) => {
    await tx.run('DELETE FROM lesson_section_lessons WHERE lesson_id = ?', lessonId)
    if (!sectionId) return
    await tx.run(
      'INSERT INTO lesson_section_lessons (section_id, lesson_id, sort_order) VALUES (?, ?, 0)',
      sectionId,
      lessonId,
    )
  })
}

async function copySectionGroups(sectionId) {
  const section = await db.get(`SELECT ${SECTION_FIELDS} FROM lesson_sections WHERE id = ?`, sectionId)
  if (!section) return
  const lessons = await db.all('SELECT lesson_id FROM lesson_section_lessons WHERE section_id = ?', sectionId)
  for (const row of lessons) {
    await db.run(
      'UPDATE lessons SET grades_1_4 = ?, grades_5_9 = ?, grades_10_11 = ?, students = ? WHERE id = ?',
      section.grades_1_4,
      section.grades_5_9,
      section.grades_10_11,
      section.students,
      row.lesson_id,
    )
  }
}

export async function listLessonSections(actor) {
  assertRole(actor, 'super')
  const rows = await db.all(`SELECT ${SECTION_FIELDS} FROM lesson_sections ORDER BY sort_order, name`)
  return rows.map(mapSection)
}

export async function createLessonSection(actor, input) {
  assertRole(actor, 'super')
  const name = cleanLabel(input?.name, 2, 80, 'Название раздела')
  const nameKk = optionalLabel(input?.nameKk, 80, 'Название раздела')
  const groups = readGroups(input)
  await assertSectionNameFree(name, nameKk)
  const orderRow = await db.get('SELECT COALESCE(MAX(sort_order), 0) AS n FROM lesson_sections')
  const id = crypto.randomUUID()
  await db.run(
    `INSERT INTO lesson_sections (
      id, name, name_kk, sort_order, grades_1_4, grades_5_9, grades_10_11, students, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    name,
    nameKk,
    Number(orderRow?.n || 0) + 1,
    ...groupNumbers(groups),
    new Date().toISOString(),
  )
  return loadSection(id)
}

export async function updateLessonSection(actor, id, input) {
  assertRole(actor, 'super')
  const current = await loadSection(id)
  if (!current) fail('Раздел не найден', 404)
  const name = cleanLabel(input?.name, 2, 80, 'Название раздела')
  const nameKk = optionalLabel(input?.nameKk, 80, 'Название раздела')
  const groups = readGroups(input)
  await assertSectionNameFree(name, nameKk, id)
  await db.run(
    `UPDATE lesson_sections
     SET name = ?, name_kk = ?, grades_1_4 = ?, grades_5_9 = ?, grades_10_11 = ?, students = ?
     WHERE id = ?`,
    name,
    nameKk,
    ...groupNumbers(groups),
    id,
  )
  await copySectionGroups(id)
  return loadSection(id)
}

export async function deleteLessonSection(actor, id) {
  assertRole(actor, 'super')
  const current = await loadSection(id)
  if (!current) fail('Раздел не найден', 404)
  await db.tx(async (tx) => {
    await tx.run('DELETE FROM lesson_section_lessons WHERE section_id = ?', id)
    await tx.run('DELETE FROM lesson_sections WHERE id = ?', id)
  })
}

export async function assignLessonSection(actor, lessonId, sectionId) {
  assertRole(actor, 'super')
  const section = await loadSection(sectionId)
  if (!section) fail('Раздел не найден', 404)
  await mustLesson(lessonId)
  await placeLesson(lessonId, section.id)
  await copySectionGroups(section.id)
  return { lessonId, sectionId: section.id }
}

export async function listLessons(actor) {
  assertRole(actor, 'super', 'learner')
  const placed = await sectionMap()
  if (actor.role === 'super') {
    const rows = await db.all('SELECT * FROM lessons ORDER BY created_at DESC')
    return rows.map((row) => summary(row, null, placed.get(row.id) || null))
  }
  const band = await learnerBand(actor)
  const rows = await db.all(`SELECT * FROM lessons WHERE ${band} = 1 ORDER BY created_at DESC`)
  const best = await bestAttempts(actor.id)
  return rows.map((row) => summary(row, best.get(row.id), placed.get(row.id) || null))
}

function slideFileId(slide) {
  if (slide.kind === 'image') return slide.fileId
  return slide.imageFileId
}

function presentSlides(slides) {
  return slides.map((slide) => {
    const fileId = slideFileId(slide)
    if (!fileId) return slide
    return { ...slide, imageUrl: fileUrl(fileId) }
  })
}

function presentQuestions(questions, withKey) {
  return questions.map((question) => {
    const item = {
      id: question.id,
      text: question.text,
      options: question.options.map((option) => ({ text: option.text })),
    }
    if (withKey) item.correctIndex = question.correctIndex
    return item
  })
}

async function mustLesson(id) {
  const row = await db.get('SELECT * FROM lessons WHERE id = ?', id)
  if (!row) fail('Урок не найден', 404)
  return row
}

function readAnswers(answers) {
  const given = new Map()
  for (const item of Array.isArray(answers) ? answers : []) {
    if (typeof item?.questionId !== 'string') continue
    const chosen = Number(item?.optionIndex ?? item?.chosen)
    given.set(item.questionId, Number.isInteger(chosen) && chosen >= 0 ? chosen : -1)
  }
  return given
}

function gradeAnswers(questions, given) {
  const results = questions.map((question) => {
    const chosen = given.has(question.id) ? given.get(question.id) : -1
    return {
      questionId: question.id,
      chosen,
      correctIndex: question.correctIndex,
      ok: chosen === question.correctIndex,
    }
  })
  return { score: results.filter((item) => item.ok).length, total: questions.length, results }
}

async function attemptsOf(lessonId, userId) {
  return db.all(
    `SELECT id, score, total, answers, finished_at, lang FROM lesson_attempts
     WHERE lesson_id = ? AND user_id = ? ORDER BY finished_at ASC, id ASC`,
    lessonId,
    userId,
  )
}

function presentAttempt(row, questions) {
  if (!row) return null
  let results = null
  if (row.answers) {
    try {
      const stored = JSON.parse(row.answers)
      results = gradeAnswers(questions, readAnswers(stored)).results
    } catch {
      results = null
    }
  }
  return { score: Number(row.score), total: Number(row.total), finishedAt: row.finished_at, lang: row.lang === 'kk' ? 'kk' : 'ru', results }
}

function attemptState(rows, max) {
  return { used: rows.length, max, locked: rows.length >= max }
}

export async function getLesson(actor, id, lang = 'ru') {
  assertRole(actor, 'super', 'learner')
  const row = await mustLesson(id)
  if (!(await canSee(actor, row))) fail('Урок не найден', 404)
  const format = lessonFormat(row)
  const pack = selectPack(row, lang)
  let best = null
  let attempts = null
  if (actor.role === 'learner') {
    const rows = await attemptsOf(id, actor.id)
    best = rows.reduce((top, item) => (!top || Number(item.score) > Number(top.score) ? item : top), null)
    const last = rows[rows.length - 1]
    const lastQuestions = last ? selectPack(row, last.lang).questions : pack.questions
    attempts = { ...attemptState(rows, attemptLimit()), last: presentAttempt(last, lastQuestions) }
  }
  const lesson = {
    ...summary(row, best, await sectionOfLesson(id)),
    title: pack.title,
    slides: format === 'video' ? [] : presentSlides(pack.slides),
    video: format === 'video' ? videoOf(row, pack.lang) : null,
    questions: presentQuestions(pack.questions, actor.role === 'super'),
    attempts,
  }
  if (actor.role !== 'super') return lesson
  const ruSlides = parseList(row.slides)
  const kkSlides = parseList(row.slides_kk)
  const ruQuestions = parseList(row.questions)
  const kkQuestions = parseList(row.questions_kk)
  return {
    ...lesson,
    title: row.title,
    titleKk: row.title_kk || '',
    slides: format === 'video' ? [] : presentSlides(ruSlides),
    slidesKk: format === 'video' ? [] : presentSlides(kkSlides),
    questions: presentQuestions(ruQuestions, true),
    questionsKk: presentQuestions(kkQuestions, true),
    video: format === 'video' && row.video_mime ? { name: row.video_name || 'video', mime: row.video_mime, lang: 'ru', updatedAt: row.updated_at || '' } : null,
    videoKk: format === 'video' && row.video_mime_kk ? { name: row.video_name_kk || 'video', mime: row.video_mime_kk, lang: 'kk', updatedAt: row.updated_at || '' } : null,
  }
}

export async function openLessonFile(actor, fileId) {
  assertRole(actor, 'super', 'learner')
  const target = filePath(fileId)
  const row = await db.get('SELECT lesson_id, mime FROM lesson_files WHERE id = ?', fileId)
  if (!row) fail('Файл не найден', 404)
  if (actor.role !== 'super') {
    if (String(row.lesson_id).startsWith('import:')) fail('Файл не найден', 404)
    const lesson = await db.get('SELECT grades_1_4, grades_5_9, grades_10_11, students FROM lessons WHERE id = ?', row.lesson_id)
    if (!lesson || !(await canSee(actor, lesson))) fail('Файл не найден', 404)
  }
  return { path: target, mime: row.mime }
}

function mediaPath(lessonId, lang = 'ru') {
  if (!UUID.test(String(lessonId || ''))) fail('Урок не найден', 404)
  return path.join(mediaRoot(), lang === 'kk' ? `${lessonId}.kk` : lessonId)
}

async function removeVideoFile(lessonId) {
  await fs.promises.rm(mediaPath(lessonId, 'ru'), { force: true })
  await fs.promises.rm(mediaPath(lessonId, 'kk'), { force: true })
}

function normalizeFrame(slide) {
  const title = cleanLabel(slide?.title, 2, 80, 'Заголовок слайда')
  const kicker = clean(slide?.kicker)
  if (kicker.length > 40) fail('Подпись слайда длиннее 40 символов')
  const source = Array.isArray(slide?.lines) ? slide.lines : []
  const lines = source.map((line) => clean(line)).filter(Boolean)
  if (lines.length < 1 || lines.length > 6) fail('На слайде от 1 до 6 строк')
  if (lines.some((line) => line.length > 160)) fail('Строка слайда длиннее 160 символов')
  const tone = TONES.includes(slide?.tone) ? slide.tone : 'orbit'
  const id = typeof slide?.id === 'string' && slide.id ? slide.id : crypto.randomUUID()
  return { id, kind: 'frame', tone, kicker, title, lines }
}

function readDataUrl(value) {
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(value || ''))
  if (!match) fail('Слайд: нужна картинка PNG, JPEG или WebP')
  const mime = match[1] === 'jpg' ? 'image/jpeg' : `image/${match[1]}`
  let bytes
  try {
    bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64')
  } catch {
    fail('Слайд: картинка повреждена')
  }
  if (!bytes.length) fail('Слайд: картинка повреждена')
  if (bytes.length > MAX_IMAGE) fail('Картинка слайда больше 1,5 МБ после сжатия')
  return { mime, bytes }
}

function isBlankSlides(slides) {
  if (!Array.isArray(slides) || slides.length === 0) return true
  return slides.every((slide) => {
    if (slide?.kind === 'image') return !slide.fileId && !slide.dataUrl && !clean(slide.caption)
    return !clean(slide?.title)
      && !(Array.isArray(slide?.lines) && slide.lines.some((line) => clean(line)))
      && !slide?.dataUrl
      && !slide?.imageFileId
  })
}

function isBlankQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) return true
  return questions.every((question) => {
    if (clean(question?.text)) return false
    const options = Array.isArray(question?.options) ? question.options : []
    return options.every((option) => !clean(option?.text))
  })
}

async function normalizeSlides(slides, lessonId, owned, used) {
  if (!Array.isArray(slides) || slides.length < 1 || slides.length > 20) {
    fail('Нужен хотя бы один слайд, максимум 20')
  }
  const result = []
  for (const [index, slide] of slides.entries()) {
    const label = `Слайд ${index + 1}`
    if (slide?.kind === 'frame') {
      const frame = normalizeFrame(slide)
      let fileId = slide?.imageFileId
      if (slide?.dataUrl) {
        const image = readDataUrl(slide.dataUrl)
        fileId = await storeFile(lessonId, image.mime, image.bytes)
      } else {
        fileId = await claimImportedFile(fileId, lessonId, owned)
      }
      if (fileId) {
        frame.imageFileId = fileId
        used.add(fileId)
      }
      result.push(frame)
      continue
    }
    if (slide?.kind !== 'image') fail(`${label}: неизвестный вид слайда`)
    const caption = clean(slide?.caption)
    if (caption.length > 120) fail(`${label}: подпись длиннее 120 символов`)
    let fileId = slide?.fileId
    if (slide?.dataUrl) {
      const image = readDataUrl(slide.dataUrl)
      fileId = await storeFile(lessonId, image.mime, image.bytes)
    } else {
      fileId = await claimImportedFile(fileId, lessonId, owned)
      if (!fileId) fail(`${label}: загрузите картинку`)
    }
    used.add(fileId)
    const id = typeof slide?.id === 'string' && slide.id ? slide.id : crypto.randomUUID()
    result.push({ id, kind: 'image', fileId, caption })
  }
  return result
}

async function claimImportedFile(fileId, lessonId, owned) {
  if (typeof fileId !== 'string' || !fileId) return ''
  if (owned.has(fileId)) return fileId
  const row = await db.get('SELECT lesson_id FROM lesson_files WHERE id = ?', fileId)
  if (!row || !String(row.lesson_id).startsWith('import:')) return ''
  await db.run('UPDATE lesson_files SET lesson_id = ? WHERE id = ?', lessonId, fileId)
  owned.add(fileId)
  return fileId
}

function normalizeQuestions(questions) {
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 20) {
    fail('Нужен хотя бы один вопрос, максимум 20')
  }
  return questions.map((question, index) => {
    const label = `Вопрос ${index + 1}`
    const text = clean(question?.text)
    if (text.length < 2 || text.length > 500) fail(`${label}: текст от 2 до 500 символов`)
    const options = []
    let correctIndex = -1
    const source = Array.isArray(question?.options) ? question.options : []
    source.forEach((option, optionIndex) => {
      const optionText = clean(option?.text)
      if (!optionText) return
      if (optionIndex === Number(question?.correctIndex)) correctIndex = options.length
      options.push({ text: optionText })
    })
    if (options.length < 2 || options.length > 4) fail(`${label}: от 2 до 4 вариантов`)
    if (options.some((option) => option.text.length > 400)) fail(`${label}: вариант длиннее 400 символов`)
    if (correctIndex < 0) fail(`${label}: отметьте правильный ответ`)
    return {
      id: typeof question?.id === 'string' && question.id ? question.id : crypto.randomUUID(),
      text,
      options,
      correctIndex,
    }
  })
}

function readFormat(input) {
  if (input?.format == null || input.format === 'slides') return 'slides'
  if (input.format === 'video') return 'video'
  fail('Неизвестный вид урока')
}

async function groupsForSave(id, input) {
  const requested = typeof input?.sectionId === 'string' ? input.sectionId : ''
  if (requested) {
    const section = await loadSection(requested)
    if (!section) fail('Раздел не найден', 404)
    return { groups: section.groups, sectionId: section.id }
  }
  const current = id ? await sectionOfLesson(id) : null
  if (current && input?.groups == null) return { groups: current.groups, sectionId: '' }
  return { groups: readGroups(input), sectionId: '' }
}

async function saveLesson(id, input, seedKey) {
  const title = cleanLabel(input?.title, 2, 80, 'Название урока')
  const titleKk = optionalLabel(input?.titleKk, 80, 'Название урока')
  const placement = await groupsForSave(id, input)
  const groups = placement.groups
  const format = readFormat(input)
  const questions = normalizeQuestions(input?.questions)
  const questionsKk = isBlankQuestions(input?.questionsKk) ? [] : normalizeQuestions(input?.questionsKk)
  const ownedRows = await db.all('SELECT id FROM lesson_files WHERE lesson_id = ?', id)
  const owned = new Set(ownedRows.map((row) => row.id))
  const used = new Set()
  const slides = format === 'video' ? [] : await normalizeSlides(input?.slides, id, owned, used)
  const slidesKk = format === 'video' || isBlankSlides(input?.slidesKk) ? [] : await normalizeSlides(input?.slidesKk, id, owned, used)
  if (format === 'video') await dropLessonFiles(id)
  else await dropFiles(ownedRows.map((row) => row.id).filter((fileId) => !used.has(fileId)))
  if (format !== 'video') await removeVideoFile(id)
  const now = new Date().toISOString()
  const numbers = groupNumbers(groups)
  const existing = await db.get('SELECT id FROM lessons WHERE id = ?', id)
  if (!existing) {
    await db.run(
      `INSERT INTO lessons (
        id, title, title_kk, seed_key, grades_1_4, grades_5_9, grades_10_11, students, format, slides, questions, slides_kk, questions_kk, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      title,
      titleKk,
      seedKey || null,
      ...numbers,
      format,
      JSON.stringify(slides),
      JSON.stringify(questions),
      JSON.stringify(slidesKk),
      JSON.stringify(questionsKk),
      now,
      now,
    )
  } else {
    await db.run(
      `UPDATE lessons
       SET title = ?, title_kk = ?, grades_1_4 = ?, grades_5_9 = ?, grades_10_11 = ?, students = ?, format = ?,
           video_mime = CASE WHEN ? = 'slides' THEN NULL ELSE video_mime END,
           video_name = CASE WHEN ? = 'slides' THEN NULL ELSE video_name END,
           video_mime_kk = CASE WHEN ? = 'slides' THEN NULL ELSE video_mime_kk END,
           video_name_kk = CASE WHEN ? = 'slides' THEN NULL ELSE video_name_kk END,
           slides = ?, questions = ?, slides_kk = ?, questions_kk = ?, updated_at = ?
       WHERE id = ?`,
      title,
      titleKk,
      ...numbers,
      format,
      format,
      format,
      format,
      format,
      JSON.stringify(slides),
      JSON.stringify(questions),
      JSON.stringify(slidesKk),
      JSON.stringify(questionsKk),
      now,
      id,
    )
  }
  if (placement.sectionId) await placeLesson(id, placement.sectionId)
  return getLesson({ role: 'super' }, id)
}

async function writeVideoFile(target, source) {
  await fs.promises.mkdir(mediaRoot(), { recursive: true })
  const tmp = `${target}.${crypto.randomUUID()}.tmp`
  try {
    if (Buffer.isBuffer(source) || source instanceof Uint8Array || Array.isArray(source)) {
      const bytes = Buffer.isBuffer(source) ? source : Buffer.from(source || [])
      if (!bytes.length) fail('Файл пустой')
      if (bytes.length > MAX_VIDEO) fail('Видео больше 80 МБ')
      await fs.promises.writeFile(tmp, bytes)
    } else if (source && typeof source.pipe === 'function') {
      let total = 0
      await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(tmp)
        let settled = false
        const stop = (err) => {
          if (settled) return
          settled = true
          source.unpipe(out)
          source.resume()
          out.destroy()
          reject(err)
        }
        source.on('data', (chunk) => {
          total += chunk.length
          if (total > MAX_VIDEO) {
            const err = new Error('Видео больше 80 МБ')
            err.status = 400
            stop(err)
          }
        })
        source.on('error', stop)
        out.on('error', stop)
        out.on('finish', () => {
          if (!settled) {
            settled = true
            resolve()
          }
        })
        source.pipe(out)
      })
      if (!total) fail('Файл пустой')
    } else {
      fail('Файл пустой')
    }
    try {
      await fs.promises.rename(tmp, target)
    } catch {
      await fs.promises.copyFile(tmp, target)
      await fs.promises.rm(tmp, { force: true })
    }
  } catch (error) {
    await fs.promises.rm(tmp, { force: true }).catch(() => {})
    throw error
  }
}

export async function saveLessonVideo(actor, id, source, mime, name, lang = 'ru') {
  assertRole(actor, 'super')
  const row = await mustLesson(id)
  if (lessonFormat(row) !== 'video') fail('Этот урок — презентация')
  const type = String(mime || '').split(';')[0].trim().toLowerCase()
  if (!VIDEO_TYPES.has(type)) fail('Нужен ролик MP4, WebM, MOV или OGG')
  const chosen = readLang(lang)
  await writeVideoFile(mediaPath(id, chosen), source)
  const safeName = clean(name).slice(0, 120) || 'video'
  if (chosen === 'kk') {
    await db.run(
      'UPDATE lessons SET video_mime_kk = ?, video_name_kk = ?, updated_at = ? WHERE id = ?',
      type,
      safeName,
      new Date().toISOString(),
      id,
    )
  } else {
    await db.run(
      'UPDATE lessons SET video_mime = ?, video_name = ?, updated_at = ? WHERE id = ?',
      type,
      safeName,
      new Date().toISOString(),
      id,
    )
  }
  return getLesson({ role: 'super' }, id)
}

export async function openLessonMedia(actor, id, lang = 'ru') {
  assertRole(actor, 'super', 'learner')
  const row = await db.get(
    `SELECT id, format, grades_1_4, grades_5_9, grades_10_11, students,
            video_mime, video_name, video_mime_kk, video_name_kk, updated_at
     FROM lessons WHERE id = ?`,
    id,
  )
  if (!row) fail('Урок не найден', 404)
  if (!(await canSee(actor, row)) || lessonFormat(row) !== 'video') fail('Видео не найдено', 404)
  const chosen = readLang(lang)
  const video = videoOf(row, chosen)
  if (!video) fail('Видео не найдено', 404)
  const target = mediaPath(id, video.lang)
  let stat
  try {
    stat = await fs.promises.stat(target)
  } catch {
    fail('Видео не найдено', 404)
  }
  const mtimeMs = Math.trunc(stat.mtimeMs || 0)
  const etag = `"${stat.size.toString(16)}-${mtimeMs.toString(16)}"`
  return {
    mime: video.mime,
    size: stat.size,
    mtimeMs,
    etag,
    path: target,
    name: video.name,
    fileName: video.lang === 'kk' ? `${id}.kk` : id,
  }
}

export async function importPptx(actor, buffer, lang = 'ru') {
  assertRole(actor, 'super')
  const parsed = await slidesFromPptx(buffer)
  const bucket = `import:${actor.id}:${readLang(lang)}`
  await dropLessonFiles(bucket)
  const slides = []
  for (const slide of parsed.slides) {
    const { dataUrl, ...rest } = slide
    if (!dataUrl) {
      slides.push(rest)
      continue
    }
    const image = readDataUrl(dataUrl)
    const fileId = await storeFile(bucket, image.mime, image.bytes)
    slides.push(rest.kind === 'image'
      ? { ...rest, fileId, imageUrl: fileUrl(fileId) }
      : { ...rest, imageFileId: fileId, imageUrl: fileUrl(fileId) })
  }
  return { slides, truncated: parsed.truncated }
}

export async function createLesson(actor, input) {
  assertRole(actor, 'super')
  return saveLesson(crypto.randomUUID(), input)
}

export async function updateLesson(actor, id, input) {
  assertRole(actor, 'super')
  await mustLesson(id)
  return saveLesson(id, input)
}

export async function deleteLesson(actor, id) {
  assertRole(actor, 'super')
  await mustLesson(id)
  await removeVideoFile(id)
  await dropLessonFiles(id)
  await db.tx(async (tx) => {
    await tx.run('DELETE FROM lesson_section_lessons WHERE lesson_id = ?', id)
    await tx.run('DELETE FROM lesson_attempts WHERE lesson_id = ?', id)
    await tx.run('DELETE FROM lessons WHERE id = ?', id)
  })
}

export async function checkLesson(actor, id, answers, lang = 'ru') {
  assertRole(actor, 'super', 'learner')
  const row = await mustLesson(id)
  if (!(await canSee(actor, row))) fail('Урок не найден', 404)
  const pack = selectPack(row, lang)
  const questions = pack.questions
  const given = readAnswers(answers)
  const graded = gradeAnswers(questions, given)
  if (actor.role !== 'learner') return { ...graded, repeated: false, attempts: null }

  const max = attemptLimit()
  const before = await attemptsOf(id, actor.id)
  if (before.length >= max) {
    // Попытки исчерпаны: повторная отправка возвращает сохранённый результат, новая строка не пишется.
    const stored = selectPack(row, before[before.length - 1].lang).questions
    return { ...presentAttempt(before[before.length - 1], stored), repeated: true, attempts: attemptState(before, max) }
  }

  const attemptId = crypto.randomUUID()
  await db.run(
    `INSERT INTO lesson_attempts (id, lesson_id, user_id, score, total, finished_at, answers, lang)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    attemptId,
    id,
    actor.id,
    graded.score,
    graded.total,
    new Date().toISOString(),
    JSON.stringify(questions.map((question) => ({
      questionId: question.id,
      chosen: given.has(question.id) ? given.get(question.id) : -1,
    }))),
    pack.lang,
  )

  // Две одновременные отправки могли пройти проверку выше: оставляем первые max попыток, лишние убираем.
  const after = await attemptsOf(id, actor.id)
  if (after.length > max) {
    for (const extra of after.slice(max)) await db.run('DELETE FROM lesson_attempts WHERE id = ?', extra.id)
    const kept = after.slice(0, max)
    const last = kept[kept.length - 1]
    return { ...presentAttempt(last, selectPack(row, last.lang).questions), repeated: last.id !== attemptId, attempts: attemptState(kept, max) }
  }
  return { ...graded, repeated: false, attempts: attemptState(after, max) }
}
