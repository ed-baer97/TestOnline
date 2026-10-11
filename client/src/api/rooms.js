import { request } from './http.js'

export const roomsApi = {
  createRoom: (quizId) => request('/api/rooms', { method: 'POST', body: JSON.stringify({ quizId }) }),
  room: (code) => request(`/api/rooms/${code}`),
  hostRoom: (code, token) => request(`/api/rooms/${code}/host?token=${encodeURIComponent(token)}`),
  advanceRoom: (code, hostToken) => request(`/api/rooms/${code}/advance`, { method: 'POST', body: JSON.stringify({ hostToken }) }),
  joinRoom: (code, body) => request(`/api/rooms/${code}/join`, { method: 'POST', body: JSON.stringify(body) }),
  playRoom: (code, token) => request(`/api/rooms/${code}/play?token=${encodeURIComponent(token)}`),
  answerRoom: (code, playerToken, optionIndex) => request(`/api/rooms/${code}/answer`, { method: 'POST', body: JSON.stringify({ playerToken, optionIndex }) }),
  network: () => request('/api/network'),
}
