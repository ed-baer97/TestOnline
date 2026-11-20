import { readSession } from '../../infrastructure/session.js'
import { sessionProfile } from '../../services/accounts.js'
import {
  advance,
  getRoom,
  joinPlayer,
  leaderboard,
  markOffline,
  onRoomChange,
  openRoom,
  publishRoom,
  remember,
  scheduleRemember,
  submitAnswer,
  viewFor,
} from '../../services/rooms/index.js'

function cookieValue(header, name) {
  for (const part of String(header || '').split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) {
      try {
        return decodeURIComponent(rest.join('='))
      } catch {
        return ''
      }
    }
  }
  return ''
}

// Сокеты всех экземпляров io в процессе: комнаты живут в памяти процесса и общие для них.
const watchers = new Set()

function watch(socket) {
  watchers.add(socket)
  socket.on('disconnect', () => watchers.delete(socket))
}

// Каждый сокет комнаты получает своё представление: ведущий — со списком игроков, игрок — со своим счётом.
function push(room) {
  let board = null
  for (const socket of watchers) {
    if (socket.data?.code !== room.code) continue
    if (!board) board = leaderboard(room)
    socket.emit('sync', viewFor(room, socket.data, board))
  }
}

let subscribed = false

export function attachRealtime(io) {
  if (!subscribed) {
    onRoomChange(push)
    subscribed = true
  }

  io.on('connection', (socket) => {
    watch(socket)

    socket.on('host:join', async ({ code, hostToken } = {}, ack) => {
      try {
        const room = getRoom(code) || await openRoom(code)
        if (!room || room.hostToken !== hostToken) {
          ack?.({ error: 'Комната не найдена или сессия ведущего устарела' })
          return
        }
        socket.data.role = 'host'
        socket.data.code = room.code
        socket.join(room.code)
        ack?.({ ok: true })
        publishRoom(room)
      } catch (error) {
        console.error(error)
        ack?.({ error: 'Ошибка сервера' })
      }
    })

    socket.on('player:join', async ({ code, name, playerToken } = {}, ack) => {
      try {
        const room = getRoom(code) || await openRoom(code)
        if (!room) {
          ack?.({ error: 'Комната не найдена' })
          return
        }
        const session = readSession(cookieValue(socket.handshake.headers.cookie, 'session'))
        const user = session?.userId ? await sessionProfile(session) : null
        const result = joinPlayer(room, { name, playerToken, user })
        if (result.error) {
          ack?.({ error: result.error })
          return
        }
        result.player.online = true
        result.player.socketId = socket.id
        socket.data.role = 'player'
        socket.data.code = room.code
        socket.data.playerId = result.player.id
        socket.join(room.code)
        scheduleRemember(room)
        ack?.({ ok: true, name: result.player.name })
        publishRoom(room)
      } catch (error) {
        console.error(error)
        ack?.({ error: 'Ошибка сервера' })
      }
    })

    socket.on('host:advance', async (ack) => {
      try {
        const room = getRoom(socket.data.code) || await openRoom(socket.data.code)
        if (socket.data.role !== 'host' || !room) {
          ack?.({ error: 'Нет доступа' })
          return
        }
        if (!advance(room)) {
          ack?.({ error: 'Сейчас это действие недоступно' })
          return
        }
        await remember(room)
        ack?.({ ok: true, status: room.status })
        publishRoom(room)
      } catch (error) {
        console.error(error)
        ack?.({ error: 'Ошибка сервера' })
      }
    })

    socket.on('player:answer', async ({ optionIndex } = {}, ack) => {
      try {
        const room = getRoom(socket.data.code) || await openRoom(socket.data.code)
        if (socket.data.role !== 'player' || !room) {
          ack?.({ error: 'Вы не в комнате' })
          return
        }
        const result = submitAnswer(room, socket.data.playerId, optionIndex)
        if (result.ok) scheduleRemember(room)
        ack?.(result)
        if (result.ok) publishRoom(room)
      } catch (error) {
        console.error(error)
        ack?.({ error: 'Ошибка сервера' })
      }
    })

    socket.on('disconnect', () => {
      const room = getRoom(socket.data.code)
      if (!room || socket.data.role !== 'player') return
      if (markOffline(room, socket.data.playerId, socket.id)) publishRoom(room)
    })
  })
}
