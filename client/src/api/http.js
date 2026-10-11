// Ответ с ошибкой превращается в Error с текстом сервера из поля error.
export async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  const data = await response.json().catch(() => ({}))
  const message = typeof data.error === 'string' ? data.error : ''
  if (!response.ok) throw new Error(message || `Ошибка запроса (${response.status})`)
  return data
}
