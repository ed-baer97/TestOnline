export function groupLessons(lessons, lang = 'ru') {
  const blocks = []
  const index = new Map()
  for (const lesson of lessons || []) {
    const key = lesson.section?.id || ''
    if (!index.has(key)) {
      const block = { key, title: lesson.section?.name || '', sort: lesson.section?.sortOrder ?? 9999, lessons: [] }
      index.set(key, block)
      blocks.push(block)
    }
    index.get(key).lessons.push(lesson)
  }
  const locale = lang === 'kk' ? 'kk' : 'ru'
  return blocks.sort((left, right) => left.sort - right.sort || left.title.localeCompare(right.title, locale))
}
