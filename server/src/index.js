import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createApp } from './app.js'
import { config } from './infrastructure/config.js'

export { createApp }

// Обработчик по умолчанию — для запуска как функции хостинга; сервер слушает порт только при запуске этого файла.
const runtime = createApp()
export default runtime.app

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isMain) {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.SESSION_SECRET) {
      console.error('Не задан SESSION_SECRET: в production укажите случайный секрет в окружении')
      process.exit(1)
    }
    if (!process.env.SUPER_PASSWORD) {
      console.error('Не задан SUPER_PASSWORD: в production укажите пароль суперглавного в окружении')
      process.exit(1)
    }
  }
  if (!config.postgresUrl) {
    console.error('Не задан POSTGRES_URL: укажите строку подключения к Postgres в server/.env (образец — server/.env.example)')
    process.exit(1)
  }
  runtime.httpServer.listen(config.port, '0.0.0.0', () => {
    console.log(`TestOnline API http://localhost:${config.port}`)
  })

  let stopping = false
  async function shutdown(signal) {
    if (stopping) return
    stopping = true
    console.log(`Остановка сервера (${signal})…`)
    const failsafe = setTimeout(() => process.exit(1), 10_000)
    failsafe.unref?.()
    try {
      await runtime.shutdown()
      clearTimeout(failsafe)
      process.exit(0)
    } catch (error) {
      console.error('Ошибка при остановке сервера', error)
      process.exit(1)
    }
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}
