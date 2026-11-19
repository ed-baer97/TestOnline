import { request, uploadWithProgress } from './http.js'

export const lessonsApi = {
  lessons: () => request('/api/lessons'),
  lesson: (id) => request(`/api/lessons/${id}`),
  checkLesson: (id, answers) => request(`/api/lessons/${id}/check`, { method: 'POST', body: JSON.stringify({ answers }) }),
  createLesson: (body) => request('/api/admin/lessons', { method: 'POST', body: JSON.stringify(body) }),
  updateLesson: (id, body) => request(`/api/admin/lessons/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  uploadLessonVideo: (id, file, onProgress) => {
    const headers = {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name || 'video'),
    }
    const url = `/api/admin/lessons/${id}/video`
    if (typeof XMLHttpRequest !== 'function') return request(url, { method: 'PUT', body: file, headers })
    return uploadWithProgress(url, file, headers, onProgress)
  },
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
  lessonSections: () => request('/api/admin/lesson-sections'),
  createLessonSection: (body) => request('/api/admin/lesson-sections', { method: 'POST', body: JSON.stringify(body) }),
  updateLessonSection: (id, body) => request(`/api/admin/lesson-sections/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteLessonSection: (id) => request(`/api/admin/lesson-sections/${id}`, { method: 'DELETE' }),
  assignLessonSection: (id, sectionId) => request(`/api/admin/lessons/${id}/section`, { method: 'PATCH', body: JSON.stringify({ sectionId }) }),
}
