import crypto from 'node:crypto'
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

export function videoFileName(lessonId, lang = 'ru') {
  return lang === 'kk' ? `${lessonId}.kk` : lessonId
}

export function videoFilePath(lessonId, lang = 'ru') {
  return path.join(config.mediaDir, videoFileName(lessonId, lang))
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

async function replaceFile(tmpPath, filePath) {
  try {
    await fs.promises.rename(tmpPath, filePath)
  } catch {
    await fs.promises.copyFile(tmpPath, filePath)
    await fs.promises.rm(tmpPath, { force: true })
  }
}

export async function writeVideoStreamOrBuffer(filePath, source, maxBytes, { onEmpty, onTooLarge }) {
  const tmpPath = `${filePath}.${crypto.randomUUID()}.tmp`
  try {
    if (Buffer.isBuffer(source) || source instanceof Uint8Array) {
      if (!source.length) throw onEmpty()
      if (source.length > maxBytes) throw onTooLarge()
      await fs.promises.writeFile(tmpPath, source)
    } else if (source && typeof source.pipe === 'function') {
      let total = 0
      await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(tmpPath)
        let settled = false
        const stop = (error) => {
          if (settled) return
          settled = true
          source.unpipe(out)
          source.resume()
          out.destroy()
          reject(error)
        }
        source.on('data', (chunk) => {
          total += chunk.length
          if (total > maxBytes) stop(onTooLarge())
        })
        source.on('error', stop)
        source.on('aborted', () => stop(onEmpty()))
        out.on('error', stop)
        out.on('finish', () => {
          if (!settled) {
            settled = true
            resolve()
          }
        })
        source.pipe(out)
      })
      if (!total) throw onEmpty()
    } else {
      throw onEmpty()
    }
    await replaceFile(tmpPath, filePath)
  } catch (error) {
    await fs.promises.rm(tmpPath, { force: true }).catch(() => {})
    throw error
  }
}

export async function removeMediaFile(filePath) {
  await fs.promises.rm(filePath, { force: true })
}

export async function mediaFileStat(filePath) {
  const stat = await fs.promises.stat(filePath)
  return { size: stat.size, mtimeMs: stat.mtimeMs }
}
