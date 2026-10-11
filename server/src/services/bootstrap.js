import { ensureDemoLesson, migrateLessonFiles } from './lessons/index.js'
import { ensureSuperAdmin } from './accounts.js'

let boot
export function bootAdmin() {
  if (!boot) {
    boot = (async () => {
      const user = await ensureSuperAdmin()
      await ensureDemoLesson()
      const moved = await migrateLessonFiles()
      if (moved) console.log(`Картинки слайдов перенесены на диск: ${moved}`)
      return user
    })().catch((error) => {
      boot = null
      throw error
    })
  }
  return boot
}
