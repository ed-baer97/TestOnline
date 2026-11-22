import crypto from 'node:crypto'
import { assertRole } from '../../domain/access.js'
import { fail } from '../../domain/errors.js'
import {
  attemptState,
  isBlankQuestions,
  isBlankSlides,
  lessonFormat,
  normalizeFrame,
  normalizeQuestions,
  packAvailable,
  parseLessonList,
  presentQuestions,
  readDataUrl,
  readFormat,
  readLang,
  readLessonGroups,
} from '../../domain/lesson.js'
import { groupsFromRow } from '../../domain/structure.js'
import { cleanText, optionalLabel } from '../../domain/text.js'
import * as lessonAttemptsRepo from '../../repositories/lessonAttempts.js'
import * as lessonFilesRepo from '../../repositories/lessonFiles.js'
import * as lessonsRepo from '../../repositories/lessons.js'
import { attemptLimit, canSee, learnerBand, mustLesson } from './access.js'
import { attemptsOf, presentAttempt } from './attempts.js'
import { claimImportedFile, dropFiles, dropLessonFiles, fileUrl, removeVideoFile, storeFile } from './files.js'
import { detachLesson, placeLesson, requireSection, sectionBrief, sectionBriefs } from './sections.js'

function summary(row, best, section = null) {
  return {
    id: row.id,
    title: row.title || '',
    titleKk: row.title_kk || '',
    format: lessonFormat(row),
    groups: groupsFromRow(row),
    section,
    slideCount: parseLessonList(row.slides).length,
    slideCountKk: parseLessonList(row.slides_kk).length,
    questionCount: parseLessonList(row.questions).length,
    questionCountKk: parseLessonList(row.questions_kk).length,
    hasVideo: Boolean(row.video_mime),
    hasVideoKk: Boolean(row.video_mime_kk),
    languages: {
      ru: packAvailable(row, 'ru'),
      kk: packAvailable(row, 'kk'),
    },
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
  const sections = await sectionBriefs()
  if (actor.role === 'super') {
    const rows = await lessonsRepo.listAllLessons()
    return rows.map((row) => summary(row, null, sections.get(row.id) || null))
  }
  const band = await learnerBand(actor)
  const rows = await lessonsRepo.listLessonsForBand(band)
  const best = await bestAttempts(actor.id)
  return rows.map((row) => summary(row, best.get(row.id), sections.get(row.id) || null))
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

function videoInfo(row, chosen) {
  if (lessonFormat(row) !== 'video') return null
  if (chosen === 'kk') return row.video_mime_kk ? { name: row.video_name_kk || 'video', mime: row.video_mime_kk } : null
  return row.video_mime ? { name: row.video_name || 'video', mime: row.video_mime } : null
}

function packData(row, chosen, withKey) {
  const format = lessonFormat(row)
  const rawSlides = parseLessonList(chosen === 'kk' ? row.slides_kk : row.slides)
  const rawQuestions = parseLessonList(chosen === 'kk' ? row.questions_kk : row.questions)
  return {
    title: chosen === 'kk' ? (row.title_kk || '') : (row.title || ''),
    slides: format === 'video' ? [] : presentSlides(rawSlides),
    video: videoInfo(row, chosen),
    questions: presentQuestions(rawQuestions, withKey),
    available: packAvailable(row, chosen),
  }
}

export async function getLesson(actor, id, lang = 'ru') {
  assertRole(actor, 'super', 'learner')
  const row = await mustLesson(id)
  if (!(await canSee(actor, row))) fail('Урок не найден', 404)
  const chosen = readLang(lang)
  const pack = packData(row, chosen, actor.role === 'super')
  const displayTitle = chosen === 'kk' ? (row.title_kk || row.title || '') : (row.title || row.title_kk || '')
  let best = null
  let attempts = null
  if (actor.role === 'learner') {
    const rows = await attemptsOf(id, actor.id)
    best = rows.reduce((top, item) => (!top || Number(item.score) > Number(top.score) ? item : top), null)
    const last = rows[rows.length - 1]
    const lastQuestions = last
      ? parseLessonList(readLang(last.lang) === 'kk' ? row.questions_kk : row.questions)
      : parseLessonList(chosen === 'kk' ? row.questions_kk : row.questions)
    attempts = { ...attemptState(rows, attemptLimit()), last: presentAttempt(last, lastQuestions) }
  }
  const lesson = {
    ...summary(row, best, await sectionBrief(id)),
    title: displayTitle,
    lang: chosen,
    available: pack.available,
    slides: pack.slides,
    video: pack.video,
    questions: pack.questions,
    attempts,
  }
  if (actor.role !== 'super') return lesson
  return {
    ...lesson,
    packs: {
      ru: packData(row, 'ru', true),
      kk: packData(row, 'kk', true),
    },
  }
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
  return result
}

async function groupsForSave(input) {
  const sectionId = typeof input?.sectionId === 'string' ? input.sectionId.trim() : ''
  if (!sectionId) return { groups: readLessonGroups(input), sectionId: '' }
  const section = await requireSection(sectionId)
  return { groups: section.groups, sectionId }
}

async function saveLesson(id, input, seedKey) {
  const title = optionalLabel(input?.title, 80, 'Название урока')
  const titleKk = optionalLabel(input?.titleKk, 80, 'Название урока')
  if (!title && !titleKk) fail('Название урока: от 2 до 80 символов')
  const { groups, sectionId } = await groupsForSave(input)
  const format = readFormat(input)
  const hasRuQ = !isBlankQuestions(input?.questions)
  const hasKkQ = !isBlankQuestions(input?.questionsKk)
  let slides = []
  let slidesKk = []
  let questions = []
  let questionsKk = []

  if (format === 'video') {
    if (!hasRuQ && !hasKkQ) fail('Нужен хотя бы один вопрос, максимум 20')
    questions = hasRuQ ? normalizeQuestions(input?.questions) : []
    questionsKk = hasKkQ ? normalizeQuestions(input?.questionsKk) : []
    await dropLessonFiles(id)
  } else {
    const hasRuS = !isBlankSlides(input?.slides)
    const hasKkS = !isBlankSlides(input?.slidesKk)
    const ruActive = hasRuS || hasRuQ
    const kkActive = hasKkS || hasKkQ
    if (!ruActive && !kkActive) fail('Нужен хотя бы один вопрос, максимум 20')
    const ownedRows = await lessonFilesRepo.listLessonFileIds(id)
    const owned = new Set(ownedRows.map((row) => row.id))
    const used = new Set()
    if (ruActive) {
      questions = normalizeQuestions(input?.questions)
      slides = await normalizeSlides(input?.slides, id, owned, used)
    }
    if (kkActive) {
      questionsKk = normalizeQuestions(input?.questionsKk)
      slidesKk = await normalizeSlides(input?.slidesKk, id, owned, used)
    }
    await dropFiles(ownedRows.map((row) => row.id).filter((fileId) => !used.has(fileId)))
    await removeVideoFile(id)
  }

  const now = new Date().toISOString()
  const existing = await lessonsRepo.lessonExists(id)
  if (!existing) {
    const sortOrder = await lessonsRepo.nextLessonSortOrder()
    await lessonsRepo.insertLesson({
      id,
      title,
      titleKk,
      seedKey: seedKey || null,
      groups,
      format,
      slides,
      questions,
      slidesKk,
      questionsKk,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    })
  } else {
    await lessonsRepo.updateLesson(id, {
      title,
      titleKk,
      groups,
      format,
      slides,
      questions,
      slidesKk,
      questionsKk,
      updatedAt: now,
    })
  }
  if (sectionId) await placeLesson(id, sectionId)
  return getLesson({ role: 'super' }, id)
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
  await detachLesson(id)
  await lessonsRepo.deleteLesson(id)
}
