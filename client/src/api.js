async function request(url, options = {}) {
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

export const api = {
  me: () => request('/api/me'),
  login: (login, password) => request('/api/login', { method: 'POST', body: JSON.stringify({ login, password }) }),
  register: (login, password) => request('/api/register', { method: 'POST', body: JSON.stringify({ login, password }) }),
  logout: () => request('/api/logout', { method: 'POST' }),
  quizzes: () => request('/api/quizzes'),
  quiz: (id) => request(`/api/quizzes/${id}`),
  createQuiz: (body) => request('/api/quizzes', { method: 'POST', body: JSON.stringify(body) }),
  updateQuiz: (id, body) => request(`/api/quizzes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteQuiz: (id) => request(`/api/quizzes/${id}`, { method: 'DELETE' }),
  results: () => request('/api/results'),
  stats: () => request('/api/stats'),
  quizStats: (id) => request(`/api/quizzes/${id}/stats`),
  createRoom: (quizId) => request('/api/rooms', { method: 'POST', body: JSON.stringify({ quizId }) }),
  room: (code) => request(`/api/rooms/${code}`),
  network: () => request('/api/network'),
  importQuestions: (file) => {
    if (!/\.xlsx$/i.test(file?.name || '')) return Promise.reject(new Error('Нужен файл Excel .xlsx'))
    if (file.size > 2 * 1024 * 1024) return Promise.reject(new Error('Файл больше 2 МБ'))
    return request('/api/import', {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': 'application/octet-stream' },
    })
  },
}

export function formatCode(code) {
  return String(code).replace(/(\d{3})(\d{3})/, '$1 $2')
}

export function hostKey(code) {
  return `host:${code}`
}

export function playerKey(code) {
  return `player:${code}`
}

export function newId() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
