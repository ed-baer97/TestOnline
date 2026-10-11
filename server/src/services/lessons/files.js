import crypto from 'node:crypto'
import { fail } from '../../domain/errors.js'
import {
  ensureSlidesDir,
  isMediaId,
  removeMediaFile,
  slideFilePath,
  videoFilePath,
  writeMediaFile,
} from '../../infrastructure/mediaStorage.js'
import * as lessonFilesRepo from '../../repositories/lessonFiles.js'

// Файлы слайдов и видео лежат на диске. Раньше картинки хранились в lesson_files.data_base64;
// при старте такие строки один раз переносятся на диск, колонка остаётся пустой.

export function filePath(fileId) {
  if (!isMediaId(fileId)) fail('Файл не найден', 404)
  return slideFilePath(fileId)
}

export function fileUrl(fileId) {
  return `/api/lessons/files/${fileId}`
}

export async function storeFile(lessonId, mime, bytes) {
  const id = crypto.randomUUID()
  await ensureSlidesDir()
  await writeMediaFile(filePath(id), bytes)
  await lessonFilesRepo.insertLessonFile({ id, lessonId, mime })
  return id
}

export async function dropFiles(ids) {
  for (const id of ids) {
    if (isMediaId(id)) await removeMediaFile(filePath(id))
    await lessonFilesRepo.deleteLessonFile(id)
  }
}

export async function dropLessonFiles(lessonId) {
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

export async function claimImportedFile(fileId, lessonId, owned) {
  if (typeof fileId !== 'string' || !fileId) return ''
  if (owned.has(fileId)) return fileId
  const row = await lessonFilesRepo.findLessonFileOwner(fileId)
  if (!row || !String(row.lesson_id).startsWith('import:')) return ''
  await lessonFilesRepo.moveLessonFile(fileId, lessonId)
  owned.add(fileId)
  return fileId
}

export function mediaPath(lessonId) {
  if (!isMediaId(lessonId)) fail('Урок не найден', 404)
  return videoFilePath(lessonId)
}

export async function removeVideoFile(lessonId) {
  await removeMediaFile(mediaPath(lessonId))
}
