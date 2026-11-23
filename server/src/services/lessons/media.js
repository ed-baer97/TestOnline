import { assertRole } from '../../domain/access.js'
import { appError, fail } from '../../domain/errors.js'
import { lessonFormat, MAX_VIDEO, readDataUrl, readLang, VIDEO_TYPES } from '../../domain/lesson.js'
import { cleanText } from '../../domain/text.js'
import { ensureMediaDir, mediaFileStat, writeVideoStreamOrBuffer } from '../../infrastructure/mediaStorage.js'
import * as lessonFilesRepo from '../../repositories/lessonFiles.js'
import * as lessonsRepo from '../../repositories/lessons.js'
import { canSee, mustLesson } from './access.js'
import { getLesson } from './catalog.js'
import { dropLessonFiles, filePath, fileUrl, mediaFileName, mediaPath, removeVideoFile, storeFile } from './files.js'
import { slidesFromPptx } from './pptx.js'

export async function openLessonFile(actor, fileId) {
  assertRole(actor, 'super', 'org', 'learner')
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

export async function saveLessonVideo(actor, id, source, mime, name, lang = 'ru') {
  assertRole(actor, 'super')
  const row = await mustLesson(id)
  if (lessonFormat(row) !== 'video') fail('Этот урок — презентация')
  const type = String(mime || '').split(';')[0].trim().toLowerCase()
  if (!VIDEO_TYPES.has(type)) fail('Нужен ролик MP4, WebM, MOV или OGG')
  const chosen = readLang(lang)
  await ensureMediaDir()
  await writeVideoStreamOrBuffer(mediaPath(id, chosen), source, MAX_VIDEO, {
    onEmpty: () => appError('Файл пустой', 400),
    onTooLarge: () => appError('Видео больше 250 МБ', 413),
  })
  const safeName = cleanText(name).slice(0, 120) || 'video'
  await lessonsRepo.setLessonVideo(id, chosen, { mime: type, name: safeName, updatedAt: new Date().toISOString() })
  return getLesson({ role: 'super' }, id, chosen)
}

export async function deleteLessonVideo(actor, id, lang = 'ru') {
  assertRole(actor, 'super')
  await mustLesson(id)
  const chosen = readLang(lang)
  await removeVideoFile(id, chosen)
  await lessonsRepo.clearLessonVideo(id, chosen, new Date().toISOString())
  return getLesson({ role: 'super' }, id, chosen)
}

export async function openLessonMedia(actor, id, lang = 'ru') {
  assertRole(actor, 'super', 'org', 'learner')
  const row = await mustLesson(id)
  const chosen = readLang(lang)
  const mime = chosen === 'kk' ? row.video_mime_kk : row.video_mime
  const name = chosen === 'kk' ? row.video_name_kk : row.video_name
  if (!(await canSee(actor, row)) || lessonFormat(row) !== 'video' || !mime) fail('Видео не найдено', 404)
  const target = mediaPath(id, chosen)
  let stat
  try {
    stat = await mediaFileStat(target)
  } catch {
    fail('Видео не найдено', 404)
  }
  return { mime, size: stat.size, mtimeMs: stat.mtimeMs, path: target, name: name || 'video', fileName: mediaFileName(id, chosen) }
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
