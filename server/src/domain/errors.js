// Ошибка с полем status: HTTP-слой отвечает этим кодом и текстом ошибки.
// Ошибка без status превращается в 500 «Ошибка сервера».
export function appError(message, status = 400) {
  const error = new Error(message)
  error.status = status
  return error
}

export function fail(message, status = 400) {
  throw appError(message, status)
}
