export function formatCode(code) {
  return String(code).replace(/(\d{3})(\d{3})/, '$1 $2')
}

export function formatWhen(value) {
  return new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export function shortWhen(value) {
  return new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' }).format(new Date(value))
}
