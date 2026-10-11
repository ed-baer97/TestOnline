// Токены живой комнаты хранятся в sessionStorage вкладки: host:<код> у ведущего, player:<код> у игрока.
// Формат ключей менять нельзя: после обновления сайта открытая вкладка должна найти свой токен.

function hostKey(code) {
  return `host:${code}`
}

function playerKey(code) {
  return `player:${code}`
}

export function readHostToken(code) {
  return sessionStorage.getItem(hostKey(code))
}

export function saveHostToken(code, token) {
  sessionStorage.setItem(hostKey(code), token)
}

export function readPlayerToken(code) {
  return sessionStorage.getItem(playerKey(code))
}

export function savePlayerToken(code, token) {
  sessionStorage.setItem(playerKey(code), token)
}

export function forgetPlayerToken(code) {
  sessionStorage.removeItem(playerKey(code))
}
