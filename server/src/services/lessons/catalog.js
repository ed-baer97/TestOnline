import crypto from 'node:crypto'
import { assertRole } from '../../domain/access.js'
import { fail } from '../../domain/errors.js'
import {
  attemptState,
  lessonFormat,
  normalizeFrame,
  normalizeQuestions,
  presentQuestions,
  readDataUrl,
  readFormat,
  readLessonGroups,
} from '../../domain/lesson.js'
import { groupsFromRow } from '../../domain/structure.js'
import { cleanLabel, cleanText } from '../../domain/text.js'
import * as lessonAttemptsRepo from '../../repositories/lessonAttempts.js'
import * as lessonFilesRepo from '../../repositories/lessonFiles.js'
import * as lessonsRepo from '../../repositories/lessons.js'
import { attemptLimit, canSee, learnerBand, mustLesson } from './access.js'
import { attemptsOf, presentAttempt } from './attempts.js'
import { claimImportedFile, dropFiles, dropLessonFiles, fileUrl, removeVideoFile, storeFile } from './files.js'

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
