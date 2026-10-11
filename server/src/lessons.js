import crypto from 'node:crypto'
import { config } from './infrastructure/config.js'
import {
  ensureMediaDir,
  ensureSlidesDir,
  isMediaId,
  mediaFileSize,
  removeMediaFile,
  slideFilePath,
  videoFilePath,
  writeMediaFile,
} from './infrastructure/mediaStorage.js'
import { slidesFromPptx } from './pptx.js'
import * as classesRepo from './repositories/classes.js'
import * as lessonAttemptsRepo from './repositories/lessonAttempts.js'
import * as lessonFilesRepo from './repositories/lessonFiles.js'
import * as lessonsRepo from './repositories/lessons.js'
import { assertRole } from './domain/access.js'
import { fail } from './domain/errors.js'
import {
  attemptState,
  gradeAnswers,
  lessonFormat,
  MAX_VIDEO,
  normalizeFrame,
  normalizeQuestions,
  presentQuestions,
  readAnswers,
  readDataUrl,
  readFormat,
  readLessonGroups,
  VIDEO_TYPES,
} from './domain/lesson.js'
import { GROUP_KEYS, groupsFromRow } from './domain/structure.js'
import { cleanLabel, cleanText } from './domain/text.js'

const DEMO_KEY = 'solar-system'

function attemptLimit() {
  return config.lessonMaxAttempts
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
    options: [{ text: 'Меркурий' }, { text: 'Венера' }, { text: 'Земля' }, { text: 'Марс' }],
    correctIndex: 0,
  },
]

export async function ensureDemoLesson() {
  const existing = await lessonsRepo.findSeededLesson(DEMO_KEY)
  if (existing) return existing.id
  if ((await lessonsRepo.countLessons()) > 0) return null
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  await lessonsRepo.insertSeedLesson({
    id,
    title: 'Солнечная система',
    seedKey: DEMO_KEY,
    slides: DEMO_SLIDES,
    questions: DEMO_QUESTIONS,
    createdAt: now,
    updatedAt: now,
  })
  return id
}

// Файлы слайдов и видео лежат на диске. Раньше картинки хранились в lesson_files.data_base64;
// при старте такие строки один раз переносятся на диск, колонка остаётся пустой.

function filePath(fileId) {
  if (!isMediaId(fileId)) fail('Файл не найден', 404)
  return slideFilePath(fileId)
}

function fileUrl(fileId) {
  return `/api/lessons/files/${fileId}`
}

async function storeFile(lessonId, mime, bytes) {
  const id = crypto.randomUUID()
  await ensureSlidesDir()
  await writeMediaFile(filePath(id), bytes)
  await lessonFilesRepo.insertLessonFile({ id, lessonId, mime })
  return id
}

async function dropFiles(ids) {
  for (const id of ids) {
    if (isMediaId(id)) await removeMediaFile(filePath(id))
    await lessonFilesRepo.deleteLessonFile(id)
  }
}

async function dropLessonFiles(lessonId) {
  const rows = await lessonFilesRepo.listLessonFileIds(lessonId)
  await dropFiles(rows.map((row) => row.id))
}

export async function migrateLessonFiles() {
  const rows = await lessonFilesRepo.listLegacyFileIds()
  if (!rows.length) return 0
  await ensureSlidesDir()
  let moved = 0
  for (const { id } of rows) {
    if (!isMediaId(id)) continue
    const row = await lessonFilesRepo.readLegacyFileData(id)
    if (!row?.data_base64) continue
    await writeMediaFile(filePath(id), Buffer.from(row.data_base64, 'base64'))
    await lessonFilesRepo.clearLegacyFileData(id)
    moved += 1
  }
  return moved
}

async function learnerBand(actor) {
  if (actor.band && GROUP_KEYS.includes(actor.band)) return actor.band
  const row = await classesRepo.findClassBand(actor.classId)
  if (!row?.band || !GROUP_KEYS.includes(row.band)) fail('Класс тестируемого не найден', 404)
  return row.band
}

async function canSee(actor, row) {
  if (actor.role === 'super') return true
  if (actor.role !== 'learner') return false
  const band = await learnerBand(actor)
  return Boolean(row[band])
}

function summary(row, best) {
  return {
    id: row.id,
    title: row.title,
    format: lessonFormat(row),
    groups: groupsFromRow(row),
    slideCount: JSON.parse(row.slides).length,
    questionCount: JSON.parse(row.questions).length,
    best: best ? { score: Number(best.score), total: Number(best.total) } : null,
  }
}

async function bestAttempts(userId) {
  const rows = await lessonAttemptsRepo.listUserAttempts(userId)
  const best = new Map()
  for (const row of rows) if (!best.has(row.lesson_id)) best.set(row.lesson_id, row)
  return best
}

export async function listLessons(actor) {
  assertRole(actor, 'super', 'learner')
  if (actor.role === 'super') {
    const rows = await lessonsRepo.listAllLessons()
    return rows.map((row) => summary(row, null))
  }
  const band = await learnerBand(actor)
  const rows = await lessonsRepo.listLessonsForBand(band)
  const best = await bestAttempts(actor.id)
  return rows.map((row) => summary(row, best.get(row.id)))
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

async function mustLesson(id) {
  const row = await lessonsRepo.findLesson(id)
  if (!row) fail('Урок не найден', 404)
  return row
}

async function attemptsOf(lessonId, userId) {
  return lessonAttemptsRepo.listAttempts(lessonId, userId)
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
  return { score: Number(row.score), total: Number(row.total), finishedAt: row.finished_at, results }
}

export async function getLesson(actor, id) {
  assertRole(actor, 'super', 'learner')
  const row = await mustLesson(id)
  if (!(await canSee(actor, row))) fail('Урок не найден', 404)
  const slides = JSON.parse(row.slides)
  const questions = JSON.parse(row.questions)
  const format = lessonFormat(row)
  let best = null
  let attempts = null
  if (actor.role === 'learner') {
    const rows = await attemptsOf(id, actor.id)
    best = rows.reduce((top, item) => (!top || Number(item.score) > Number(top.score) ? item : top), null)
    attempts = { ...attemptState(rows, attemptLimit()), last: presentAttempt(rows[rows.length - 1], questions) }
  }
  return {
    ...summary(row, best),
    slides: format === 'video' ? [] : presentSlides(slides),
    video: format === 'video' && row.video_mime ? { name: row.video_name || 'video', mime: row.video_mime } : null,
    questions: presentQuestions(questions, actor.role === 'super'),
    attempts,
  }
}

export async function openLessonFile(actor, fileId) {
  assertRole(actor, 'super', 'learner')
  const target = filePath(fileId)
  const row = await lessonFilesRepo.findLessonFile(fileId)
  if (!row) fail('Файл не найден', 404)
  if (actor.role !== 'super') {
    if (String(row.lesson_id).startsWith('import:')) fail('Файл не найден', 404)
    const lesson = await lessonsRepo.findLessonGroups(row.lesson_id)
    if (!lesson || !(await canSee(actor, lesson))) fail('Файл не найден', 404)
  }
  return { path: target, mime: row.mime }
}

function mediaPath(lessonId) {
  if (!isMediaId(lessonId)) fail('Урок не найден', 404)
  return videoFilePath(lessonId)
}

async function removeVideoFile(lessonId) {
  await removeMediaFile(mediaPath(lessonId))
}

async function normalizeSlides(slides, lessonId) {
  if (!Array.isArray(slides) || slides.length < 1 || slides.length > 20) {
    fail('Нужен хотя бы один слайд, максимум 20')
  }
  const ownedRows = await lessonFilesRepo.listLessonFileIds(lessonId)
  const owned = new Set(ownedRows.map((row) => row.id))
  const used = new Set()
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
    const caption = cleanText(slide?.caption)
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
  await dropFiles(ownedRows.map((row) => row.id).filter((id) => !used.has(id)))
  return result
}

async function claimImportedFile(fileId, lessonId, owned) {
  if (typeof fileId !== 'string' || !fileId) return ''
  if (owned.has(fileId)) return fileId
  const row = await lessonFilesRepo.findLessonFileOwner(fileId)
  if (!row || !String(row.lesson_id).startsWith('import:')) return ''
  await lessonFilesRepo.moveLessonFile(fileId, lessonId)
  owned.add(fileId)
  return fileId
}

async function saveLesson(id, input, seedKey) {
  const title = cleanLabel(input?.title, 2, 80, 'Название урока')
  const groups = readLessonGroups(input)
  const format = readFormat(input)
  const questions = normalizeQuestions(input?.questions)
  const slides = format === 'video' ? [] : await normalizeSlides(input?.slides, id)
  if (format === 'video') await dropLessonFiles(id)
  else await removeVideoFile(id)
  const now = new Date().toISOString()
  const existing = await lessonsRepo.lessonExists(id)
  if (!existing) {
    await lessonsRepo.insertLesson({ id, title, seedKey: seedKey || null, groups, format, slides, questions, createdAt: now, updatedAt: now })
  } else {
    await lessonsRepo.updateLesson(id, { title, groups, format, slides, questions, updatedAt: now })
  }
  return getLesson({ role: 'super' }, id)
}

export async function saveLessonVideo(actor, id, buffer, mime, name) {
  assertRole(actor, 'super')
  const row = await mustLesson(id)
  if (lessonFormat(row) !== 'video') fail('Этот урок — презентация')
  const type = String(mime || '').split(';')[0].trim().toLowerCase()
  if (!VIDEO_TYPES.has(type)) fail('Нужен ролик MP4, WebM, MOV или OGG')
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || [])
  if (!bytes.length) fail('Файл пустой')
  if (bytes.length > MAX_VIDEO) fail('Видео больше 80 МБ')
  await ensureMediaDir()
  await writeMediaFile(mediaPath(id), bytes)
  const safeName = cleanText(name).slice(0, 120) || 'video'
  await lessonsRepo.setLessonVideo(id, { mime: type, name: safeName, updatedAt: new Date().toISOString() })
  return getLesson({ role: 'super' }, id)
}

export async function openLessonMedia(actor, id) {
  assertRole(actor, 'super', 'learner')
  const row = await mustLesson(id)
  if (!(await canSee(actor, row)) || lessonFormat(row) !== 'video' || !row.video_mime) fail('Видео не найдено', 404)
  const target = mediaPath(id)
  let size
  try {
    size = await mediaFileSize(target)
  } catch {
    fail('Видео не найдено', 404)
  }
  return { mime: row.video_mime, size, path: target, name: row.video_name || 'video' }
}

export async function importPptx(actor, buffer) {
  assertRole(actor, 'super')
  const parsed = await slidesFromPptx(buffer)
  const bucket = `import:${actor.id}`
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
  await lessonAttemptsRepo.deleteLessonAttempts(id)
  await lessonsRepo.deleteLesson(id)
}

export async function checkLesson(actor, id, answers) {
  assertRole(actor, 'super', 'learner')
  const row = await mustLesson(id)
  if (!(await canSee(actor, row))) fail('Урок не найден', 404)
  const questions = JSON.parse(row.questions)
  const given = readAnswers(answers)
  const graded = gradeAnswers(questions, given)
  if (actor.role !== 'learner') return { ...graded, repeated: false, attempts: null }

  const max = attemptLimit()
  const before = await attemptsOf(id, actor.id)
  if (before.length >= max) {
    // Попытки исчерпаны: повторная отправка возвращает сохранённый результат, новая строка не пишется.
    return { ...presentAttempt(before[before.length - 1], questions), repeated: true, attempts: attemptState(before, max) }
  }

  const attemptId = crypto.randomUUID()
  await lessonAttemptsRepo.insertAttempt({
    id: attemptId,
    lessonId: id,
    userId: actor.id,
    score: graded.score,
    total: graded.total,
    finishedAt: new Date().toISOString(),
    answers: questions.map((question) => ({
      questionId: question.id,
      chosen: given.has(question.id) ? given.get(question.id) : -1,
    })),
  })

  // Две одновременные отправки могли пройти проверку выше: оставляем первые max попыток, лишние убираем.
  const after = await attemptsOf(id, actor.id)
  if (after.length > max) {
    for (const extra of after.slice(max)) await lessonAttemptsRepo.deleteAttempt(extra.id)
    const kept = after.slice(0, max)
    const last = kept[kept.length - 1]
    return { ...presentAttempt(last, questions), repeated: last.id !== attemptId, attempts: attemptState(kept, max) }
  }
  return { ...graded, repeated: false, attempts: attemptState(after, max) }
}
