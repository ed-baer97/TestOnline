export function formatCode(code) {
  return String(code).replace(/(\d{3})(\d{3})/, '$1 $2')
}
