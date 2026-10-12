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
  logout: () => request('/api/logout', { method: 'POST' }),
  dashboard: () => request('/api/admin/dashboard'),
  platformStats: (regionId) => request(regionId ? `/api/admin/platform-stats?regionId=${encodeURIComponent(regionId)}` : '/api/admin/platform-stats'),
  orgStats: (organizationId) => request(organizationId ? `/api/admin/org-stats?organizationId=${encodeURIComponent(organizationId)}` : '/api/admin/org-stats'),
  regions: () => request('/api/admin/regions'),
  createRegion: (body) => request('/api/admin/regions', { method: 'POST', body: JSON.stringify(body) }),
  updateRegion: (id, body) => request(`/api/admin/regions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteRegion: (id) => request(`/api/admin/regions/${id}`, { method: 'DELETE' }),
  regionalAdmins: () => request('/api/admin/regional-admins'),
  createRegionalAdmin: (body) => request('/api/admin/regional-admins', { method: 'POST', body: JSON.stringify(body) }),
  updateRegionalAdmin: (id, body) => request(`/api/admin/regional-admins/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteRegionalAdmin: (id) => request(`/api/admin/regional-admins/${id}`, { method: 'DELETE' }),
  organizations: () => request('/api/admin/organizations'),
  districts: () => request('/api/admin/districts'),
  createOrganization: (body) => request('/api/admin/organizations', { method: 'POST', body: JSON.stringify(body) }),
  updateOrganization: (id, body) => request(`/api/admin/organizations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteOrganization: (id) => request(`/api/admin/organizations/${id}`, { method: 'DELETE' }),
  orgAdmins: () => request('/api/admin/org-admins'),
  createOrgAdmin: (body) => request('/api/admin/org-admins', { method: 'POST', body: JSON.stringify(body) }),
  updateOrgAdmin: (id, body) => request(`/api/admin/org-admins/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteOrgAdmin: (id) => request(`/api/admin/org-admins/${id}`, { method: 'DELETE' }),
  structure: () => request('/api/admin/structure'),
  createTrack: (body) => request('/api/admin/tracks', { method: 'POST', body: JSON.stringify(body) }),
  updateTrack: (id, body) => request(`/api/admin/tracks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteTrack: (id) => request(`/api/admin/tracks/${id}`, { method: 'DELETE' }),
  createClass: (body) => request('/api/admin/classes', { method: 'POST', body: JSON.stringify(body) }),
  updateClass: (id, body) => request(`/api/admin/classes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteClass: (id) => request(`/api/admin/classes/${id}`, { method: 'DELETE' }),
  learners: (params = {}) => {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) if (value !== '' && value != null) query.set(key, String(value))
    const suffix = query.toString()
    return request(`/api/admin/learners${suffix ? `?${suffix}` : ''}`)
  },
  importLearners: (file) => {
    if (!/\.xlsx$/i.test(file?.name || '')) return Promise.reject(new Error('Нужен файл Excel .xlsx'))
    if (file.size > 5 * 1024 * 1024) return Promise.reject(new Error('Файл больше 5 МБ'))
    return request('/api/admin/learners/import', {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': 'application/octet-stream' },
    })
  },
  createLearner: (body) => request('/api/admin/learners', { method: 'POST', body: JSON.stringify(body) }),
  updateLearner: (id, body) => request(`/api/admin/learners/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteLearner: (id) => request(`/api/admin/learners/${id}`, { method: 'DELETE' }),
  lessons: () => request('/api/lessons'),
  lesson: (id, lang) => request(`/api/lessons/${id}${lang ? `?lang=${encodeURIComponent(lang)}` : ''}`),
  checkLesson: (id, answers, lang) => request(`/api/lessons/${id}/check`, { method: 'POST', body: JSON.stringify({ answers, lang }) }),
  createLesson: (body) => request('/api/admin/lessons', { method: 'POST', body: JSON.stringify(body) }),
  updateLesson: (id, body) => request(`/api/admin/lessons/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  uploadLessonVideo: (id, file, lang = 'ru') => request(`/api/admin/lessons/${id}/video?lang=${encodeURIComponent(lang)}`, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name || 'video'),
      'X-Lang': lang,
    },
  }),
  importPptx: (file) => {
    if (!/\.pptx$/i.test(file?.name || '')) return Promise.reject(new Error('Нужна презентация PowerPoint .pptx'))
    if (file.size > 30 * 1024 * 1024) return Promise.reject(new Error('Презентация больше 30 МБ'))
    return request('/api/admin/lessons/pptx', {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
    })
  },
  deleteLesson: (id) => request(`/api/admin/lessons/${id}`, { method: 'DELETE' }),
  quizzes: () => request('/api/quizzes'),
  quiz: (id) => request(`/api/quizzes/${id}`),
  createQuiz: (body) => request('/api/quizzes', { method: 'POST', body: JSON.stringify(body) }),
  updateQuiz: (id, body) => request(`/api/quizzes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteQuiz: (id) => request(`/api/quizzes/${id}`, { method: 'DELETE' }),
  results: () => request('/api/results'),
  stats: () => request('/api/stats'),
  quizStats: (id) => request(`/api/quizzes/${id}/stats`),
  createRoom: (body) => request('/api/rooms', { method: 'POST', body: JSON.stringify(typeof body === 'string' ? { quizId: body } : body) }),
  launchTargets: () => request('/api/admin/launch-targets'),
  launchQuizzes: () => request('/api/admin/launch-quizzes'),
  liveQuizzes: () => request('/api/learn/live'),
  room: (code) => request(`/api/rooms/${code}`),
  hostRoom: (code, token) => request(`/api/rooms/${code}/host?token=${encodeURIComponent(token)}`),
  advanceRoom: (code, hostToken) => request(`/api/rooms/${code}/advance`, { method: 'POST', body: JSON.stringify({ hostToken }) }),
  joinRoom: (code, body) => request(`/api/rooms/${code}/join`, { method: 'POST', body: JSON.stringify(body) }),
  playRoom: (code, token) => request(`/api/rooms/${code}/play?token=${encodeURIComponent(token)}`),
  answerRoom: (code, playerToken, optionIndex) => request(`/api/rooms/${code}/answer`, { method: 'POST', body: JSON.stringify({ playerToken, optionIndex }) }),
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
