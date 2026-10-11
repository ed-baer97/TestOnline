export const SHAPES = ['triangle', 'diamond', 'circle', 'square']
export const COLOR_NAMES = ['red', 'blue', 'yellow', 'green']

export function Shape({ name }) {
  if (name === 'triangle') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16 3 30 29H2Z" />
      </svg>
    )
  }
  if (name === 'diamond') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16 2 30 16 16 30 2 16Z" />
      </svg>
    )
  }
  if (name === 'circle') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="12" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="4" y="4" width="24" height="24" rx="2" />
    </svg>
  )
}
