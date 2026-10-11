import { assertRole } from '../../domain/access.js'
import { fail } from '../../domain/errors.js'
import { lessonFormat, MAX_VIDEO, readDataUrl, VIDEO_TYPES } from '../../domain/lesson.js'
import { cleanText } from '../../domain/text.js'
import { ensureMediaDir, mediaFileSize, writeMediaFile } from '../../infrastructure/mediaStorage.js'
import * as lessonFilesRepo from '../../repositories/lessonFiles.js'
import * as lessonsRepo from '../../repositories/lessons.js'
import { canSee, mustLesson } from './access.js'
import { getLesson } from './catalog.js'
import { dropLessonFiles, filePath, fileUrl, mediaPath, storeFile } from './files.js'
import { slidesFromPptx } from './pptx.js'

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
