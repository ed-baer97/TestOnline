import { request } from './http.js'

export const authApi = {
  me: () => request('/api/me'),
  login: (login, password) => request('/api/login', { method: 'POST', body: JSON.stringify({ login, password }) }),
  logout: () => request('/api/logout', { method: 'POST' }),
}
