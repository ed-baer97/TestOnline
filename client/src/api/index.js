import { adminApi } from './admin.js'
import { authApi } from './auth.js'
import { lessonsApi } from './lessons.js'
import { quizzesApi } from './quizzes.js'
import { roomsApi } from './rooms.js'

// Клиент HTTP API. Его вызывают только хуки из state/, страницы получают данные через них.
export const api = {
  ...authApi,
  ...adminApi,
  ...lessonsApi,
  ...quizzesApi,
  ...roomsApi,
}
