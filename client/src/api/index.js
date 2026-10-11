import { adminApi } from './admin.js'
import { authApi } from './auth.js'
import { lessonsApi } from './lessons.js'
import { quizzesApi } from './quizzes.js'
import { roomsApi } from './rooms.js'

// Клиент HTTP API. Страницы и состояние обращаются к серверу только через него.
export const api = {
  ...authApi,
  ...adminApi,
  ...lessonsApi,
  ...quizzesApi,
  ...roomsApi,
}
