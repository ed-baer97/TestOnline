export const BANDS = [
  { id: 'grades_1_4', label: '1–4 классы' },
  { id: 'grades_5_9', label: '5–9 классы' },
  { id: 'grades_10_11', label: '10–11 классы' },
  { id: 'students', label: 'Студенты' },
]

export const EMPTY_GROUPS = Object.fromEntries(BANDS.map((band) => [band.id, false]))

export function groupLabels(groups, translate = (label) => label) {
  return BANDS.filter((band) => groups?.[band.id]).map((band) => translate(band.label)).join(', ')
}
