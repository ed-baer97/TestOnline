import { request } from './http.js'

export const adminApi = {
  dashboard: () => request('/api/admin/dashboard'),
  regions: () => request('/api/admin/regions'),
  createRegion: (body) => request('/api/admin/regions', { method: 'POST', body: JSON.stringify(body) }),
  updateRegion: (id, body) => request(`/api/admin/regions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteRegion: (id) => request(`/api/admin/regions/${id}`, { method: 'DELETE' }),
  regionalAdmins: () => request('/api/admin/regional-admins'),
  createRegionalAdmin: (body) => request('/api/admin/regional-admins', { method: 'POST', body: JSON.stringify(body) }),
  updateRegionalAdmin: (id, body) => request(`/api/admin/regional-admins/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteRegionalAdmin: (id) => request(`/api/admin/regional-admins/${id}`, { method: 'DELETE' }),
  organizations: () => request('/api/admin/organizations'),
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
}
