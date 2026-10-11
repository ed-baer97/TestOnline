const listeners = new Set()

// Транспорт подписывается на изменения комнат; publishRoom вызывают после каждого изменения состояния.
export function onRoomChange(listener) {
  listeners.add(listener)
}

export function publishRoom(room) {
  for (const listener of listeners) listener(room)
}
