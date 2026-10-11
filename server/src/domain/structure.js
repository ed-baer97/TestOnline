import { fail } from './errors.js'

// Группы (band): у организации и у урока отмечено, для каких групп они.
export const BANDS = [
  { id: 'grades_1_4', label: '1–4 классы', grades: [1, 2, 3, 4] },
  { id: 'grades_5_9', label: '5–9 классы', grades: [5, 6, 7, 8, 9] },
  { id: 'grades_10_11', label: '10–11 классы', grades: [10, 11] },
  { id: 'students', label: 'Студенты', grades: [] },
]

export const GROUP_KEYS = BANDS.map((band) => band.id)

export function pickGroups(source) {
  const groups = {}
  for (const key of GROUP_KEYS) groups[key] = Boolean(source[key])
  if (!GROUP_KEYS.some((key) => groups[key])) fail('Отметьте хотя бы одну группу')
  return groups
}

// Группы организации принимаются и как { groups: {...} }, и плоско в теле запроса.
export function readGroups(input) {
  return pickGroups(input?.groups || input || {})
}

export function groupNumbers(groups) {
  return GROUP_KEYS.map((key) => (groups[key] ? 1 : 0))
}

export function groupsFromRow(row) {
  return {
    grades_1_4: Boolean(row.grades_1_4),
    grades_5_9: Boolean(row.grades_5_9),
    grades_10_11: Boolean(row.grades_10_11),
    students: Boolean(row.students),
  }
}

export function bandForGrade(grade) {
  return BANDS.find((band) => band.grades.includes(grade)) || null
}

// «5а · 5 класс» или «ИС-21 · 1 курс». Принимает строку из базы или уже собранный класс.
export function classCaption(row) {
  if (!row) return null
  const name = row.class_name || row.name
  if (row.band === 'students') return `${name} · ${row.track_name || row.trackName || 'Студенты'}`
  return `${name} · ${row.grade} класс`
}
