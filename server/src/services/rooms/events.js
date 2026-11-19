const listeners = new Set()
let persistListener = null

// Транспорт подписывается на изменения комнат; publishRoom вызывают после каждого изменения состояния.
export function onRoomChange(listener) {
  listeners.add(listener)
}

export function publishRoom(room) {
  for (const listener of listeners) listener(room)
}

// store.js регистрирует сохранение комнаты при закрытии вопроса по таймеру (без циклического импорта).
export function onRoomPersist(listener) {
  persistListener = listener
}

export function persistRoom(room) {
  persistListener?.(room)
}
