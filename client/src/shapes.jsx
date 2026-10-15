export const SHAPES = ['triangle', 'diamond', 'circle', 'square']
export const COLOR_NAMES = ['red', 'blue', 'yellow', 'green']

function answerFitChars(text, dense = false) {
  const length = Math.max(String(text ?? '').trim().length, 1)
  const start = dense ? 26 : 34
  const lines = length <= start
    ? 1
    : Math.min(2, 1 + (length - start) / (dense ? 110 : 80))
  return Math.round((length / lines) * 10) / 10
}

export function AnswerText({ text, dense = false }) {
  return <span style={{ '--answer-chars': String(answerFitChars(text, dense)) }}>{text}</span>
}

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
