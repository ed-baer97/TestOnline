import * as systemRepo from '../repositories/system.js'
import { flushRooms } from './rooms/index.js'

export async function checkHealth() {
  await systemRepo.pingDb()
  return { ok: true }
}

export async function shutdownServices() {
  await flushRooms()
  await systemRepo.closeDatabase()
}
