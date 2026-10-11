import { db } from '../infrastructure/db/index.js'

// Записи о картинках слайдов. Сами файлы лежат на диске (infrastructure/mediaStorage).
// lesson_id вида «import:<id пользователя>» — картинки из PowerPoint, ещё не привязанные к уроку.
// data_base64 — старое хранение картинок в базе; при запуске такие строки переносятся на диск.

export async function insertLessonFile({ id, lessonId, mime }) {
  await db.run('INSERT INTO lesson_files (id, lesson_id, mime, data_base64) VALUES (?, ?, ?, ?)', id, lessonId, mime, '')
}

export async function deleteLessonFile(id) {
  await db.run('DELETE FROM lesson_files WHERE id = ?', id)
}

export async function listLessonFileIds(lessonId) {
  return db.all('SELECT id FROM lesson_files WHERE lesson_id = ?', lessonId)
}

export async function findLessonFile(id) {
  return db.get('SELECT lesson_id, mime FROM lesson_files WHERE id = ?', id)
}

export async function findLessonFileOwner(id) {
  return db.get('SELECT lesson_id FROM lesson_files WHERE id = ?', id)
}

export async function moveLessonFile(id, lessonId) {
  await db.run('UPDATE lesson_files SET lesson_id = ? WHERE id = ?', lessonId, id)
}

export async function listLegacyFileIds() {
  return db.all("SELECT id FROM lesson_files WHERE data_base64 <> ''")
}

export async function readLegacyFileData(id) {
  return db.get('SELECT data_base64 FROM lesson_files WHERE id = ?', id)
}

export async function clearLegacyFileData(id) {
  await db.run("UPDATE lesson_files SET data_base64 = '' WHERE id = ?", id)
}
