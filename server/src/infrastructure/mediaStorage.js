import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

// Медиа уроков лежат на диске: картинки слайдов — <MEDIA_DIR>/files/<id>, видео — <MEDIA_DIR>/<id урока>.
// Имя файла — UUID; путь строят только для имени, которое прошло isMediaId, иначе возможен выход из папки.
const MEDIA_ID = /^[0-9a-f-]{36}$/i

export function isMediaId(value) {
  return MEDIA_ID.test(String(value || ''))
}

function slidesDir() {
  return path.join(config.mediaDir, 'files')
}

export function slideFilePath(fileId) {
  return path.join(slidesDir(), fileId)
}

export function videoFilePath(lessonId) {
  return path.join(config.mediaDir, lessonId)
}

export async function ensureSlidesDir() {
  await fs.promises.mkdir(slidesDir(), { recursive: true })
}

export async function ensureMediaDir() {
  await fs.promises.mkdir(config.mediaDir, { recursive: true })
}

export async function writeMediaFile(filePath, bytes) {
  await fs.promises.writeFile(filePath, bytes)
}

export async function removeMediaFile(filePath) {
  await fs.promises.rm(filePath, { force: true })
}

export async function mediaFileSize(filePath) {
  return (await fs.promises.stat(filePath)).size
}
