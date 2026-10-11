import { createServer } from 'node:http'
import cookieParser from 'cookie-parser'
import express from 'express'
import { Server } from 'socket.io'
import { config } from './infrastructure/config.js'
import { bootstrap, jsonBody, socketBridge } from './transport/http/middleware.js'
import { registerAdminRoutes } from './transport/http/routes/admin.js'
import { registerAuthRoutes } from './transport/http/routes/auth.js'
import { registerFallbacks } from './transport/http/routes/fallbacks.js'
import { registerLessonRoutes } from './transport/http/routes/lessons.js'
import { registerQuizRoutes } from './transport/http/routes/quizzes.js'
import { registerRoomRoutes } from './transport/http/routes/rooms.js'
import { registerSystemRoutes } from './transport/http/routes/system.js'
import { attachRealtime } from './transport/realtime/socket.js'

// Сборка приложения: express, HTTP-сервер и Socket.io. Порядок middleware и маршрутов важен.
export function createApp() {
  const app = express()
  const httpServer = createServer(app)
  const io = new Server(httpServer, {
    pingInterval: 10000,
    pingTimeout: 20000,
    maxHttpBufferSize: 1e5,
    addTrailingSlash: false,
  })

  if (config.trustProxy) app.set('trust proxy', 1)

  app.use(socketBridge(io))
  app.use(cookieParser())
  app.use(jsonBody())
  app.use(bootstrap())

  registerSystemRoutes(app)
  registerAuthRoutes(app)
  registerAdminRoutes(app)
  registerLessonRoutes(app)
  registerQuizRoutes(app)
  registerRoomRoutes(app)
  attachRealtime(io)
  registerFallbacks(app)

  return { app, httpServer, io }
}
