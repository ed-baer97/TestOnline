import { request } from './http.js'

export const quizzesApi = {
  quizzes: () => request('/api/quizzes'),
  quiz: (id) => request(`/api/quizzes/${id}`),
  createQuiz: (body) => request('/api/quizzes', { method: 'POST', body: JSON.stringify(body) }),
  updateQuiz: (id, body) => request(`/api/quizzes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteQuiz: (id) => request(`/api/quizzes/${id}`, { method: 'DELETE' }),
  results: () => request('/api/results'),
  stats: () => request('/api/stats'),
  quizStats: (id) => request(`/api/quizzes/${id}/stats`),
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
