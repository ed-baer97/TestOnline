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
  if (!config.postgresUrl) {
    console.error('Не задан POSTGRES_URL: укажите строку подключения к Postgres в server/.env (образец — server/.env.example)')
    process.exit(1)
  }
  runtime.httpServer.listen(config.port, '0.0.0.0', () => {
    console.log(`TestOnline API http://localhost:${config.port}`)
  })
}
