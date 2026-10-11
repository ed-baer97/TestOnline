import crypto from 'node:crypto'
import JSZip from 'jszip'
import sharp from 'sharp'
import { fail } from '../../domain/errors.js'
import { MAX_IMAGE, TONES } from '../../domain/lesson.js'

const MAX_SLIDES = 20

function decodeXml(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function clip(value, max) {
  const text = value.replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trim()}…`
}

function relationships(xml) {
  const map = new Map()
  if (!xml) return map
  for (const match of xml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /(?:^|\s)Id="([^"]+)"/.exec(match[1])?.[1]
    const target = /(?:^|\s)Target="([^"]+)"/.exec(match[1])?.[1]
    if (id && target) map.set(id, decodeXml(target))
  }
  return map
}

function resolveTarget(baseFile, target) {
  if (target.startsWith('/')) return target.replace(/^\/+/, '')
  const dir = baseFile.split('/').slice(0, -1)
  for (const part of target.split('/')) {
    if (part === '..') dir.pop()
    else if (part && part !== '.') dir.push(part)
  }
  return dir.join('/')
}

function paragraphs(xml) {
  if (!xml) return []
  return xml.split(/<a:p[\s>]/).slice(1).map((block) => {
    const end = block.indexOf('</a:p>')
    const body = end >= 0 ? block.slice(0, end) : block
    return [...body.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((match) => decodeXml(match[1])).join('')
  }).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

function mimeFor(name) {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  return ''
}

async function fitImage(bytes, mime) {
  if (bytes.length <= MAX_IMAGE) return { bytes, mime }
  let quality = 82
  let width = 1920
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const output = await sharp(bytes, { failOn: 'none' })
        .rotate()
        .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer()
      if (output.length && output.length <= MAX_IMAGE) return { bytes: output, mime: 'image/jpeg' }
    } catch {
      return null
    }
    quality = Math.max(48, quality - 10)
    width = Math.round(width * 0.75)
  }
  return null
}

async function largestImage(zip, slidePath) {
  const relPath = slidePath.replace(/([^/]+)$/, `_rels/$1.rels`)
  const rels = relationships(await zip.file(relPath)?.async('string'))
  let best = null
  for (const target of rels.values()) {
    const filePath = resolveTarget(slidePath, target)
    const mime = mimeFor(filePath)
    if (!mime) continue
    const file = zip.file(filePath)
    if (!file) continue
    const raw = await file.async('nodebuffer')
    if (!raw.length) continue
    const fitted = await fitImage(raw, mime)
    if (!fitted) continue
    if (!best || fitted.bytes.length > best.bytes.length) best = fitted
  }
  return best
}

function frameFromText(texts, index) {
  const title = clip(texts[0] || `Слайд ${index + 1}`, 80)
  const lines = (texts.length > 1 ? texts.slice(1) : [title]).slice(0, 6).map((line) => clip(line, 160))
  return {
    id: crypto.randomUUID(),
    kind: 'frame',
    tone: TONES[index % TONES.length],
    kicker: `Слайд ${index + 1}`,
    title: title.length >= 2 ? title : `Слайд ${index + 1}`,
    lines: lines.length ? lines : [title],
  }
}

export async function slidesFromPptx(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || [])
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) fail('Нужна презентация PowerPoint .pptx')
  let zip
  try {
    zip = await JSZip.loadAsync(bytes)
  } catch {
    fail('Не удалось прочитать презентацию')
  }
  const presentation = await zip.file('ppt/presentation.xml')?.async('string')
  const rels = relationships(await zip.file('ppt/_rels/presentation.xml.rels')?.async('string'))
  if (!presentation) fail('Это не презентация PowerPoint')
  const ids = [...presentation.matchAll(/<p:sldId\b([^>]*)\/?>/g)].map((match) => /r:id="([^"]+)"/.exec(match[1])?.[1]).filter(Boolean)
  const targets = ids.map((id) => rels.get(id)).filter(Boolean)
  if (!targets.length) fail('В презентации нет слайдов')
  const truncated = targets.length > MAX_SLIDES
  const slides = []
  for (const [index, target] of targets.slice(0, MAX_SLIDES).entries()) {
    const slidePath = resolveTarget('ppt/presentation.xml', target)
    const xml = await zip.file(slidePath)?.async('string')
    const texts = paragraphs(xml)
    const image = await largestImage(zip, slidePath)
    if (!texts.length && image) {
      slides.push({
        id: crypto.randomUUID(),
        kind: 'image',
        caption: `Слайд ${index + 1}`,
        dataUrl: `data:${image.mime};base64,${image.bytes.toString('base64')}`,
      })
      continue
    }
    const frame = frameFromText(texts, index)
    if (image) frame.dataUrl = `data:${image.mime};base64,${image.bytes.toString('base64')}`
    slides.push(frame)
  }
  if (!slides.length) fail('В презентации нет слайдов')
  return { slides, truncated }
}
