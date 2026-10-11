// Живые комнаты: хранение в памяти и в live_rooms (store), ход игры и таймеры (game),
// что видят ведущий и игрок (views), подписка транспорта на изменения (events).
export { createRoom, getRoom, openRoom, remember } from './store.js'
export { advance, closeQuestion, joinPlayer, markOffline, playerByToken, submitAnswer } from './game.js'
export { hostView, playerView, publicInfo, viewFor } from './views.js'
export { onRoomChange, publishRoom } from './events.js'
