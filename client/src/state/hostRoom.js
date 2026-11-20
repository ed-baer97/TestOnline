import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { io } from 'socket.io-client'
import { api } from '../api/index.js'
import { readHostToken } from './roomTokens.js'

// Экран ведущего подключается по Socket.io и получает мгновенные обновления комнаты.
export function useHostRoom(code) {
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  const [online, setOnline] = useState(true)
  const socketRef = useRef(null)

  useEffect(() => {
    setState(null)
    setError('')
    const token = readHostToken(code)
    if (!token) {
      setError('Откройте комнату кнопкой «Запустить» в панели ведущего.')
      return undefined
    }
    const socket = io({ withCredentials: true })
    socketRef.current = socket
    let stopped = false

    const join = () => {
      socket.timeout(8000).emit('host:join', { code, hostToken: token }, (err, res) => {
        if (stopped) return
        if (err) {
          setOnline(false)
          return
        }
        if (res?.error) {
          setOnline(false)
          setError(res.error)
          return
        }
        setOnline(true)
        setError('')
      })
    }

    socket.on('connect', () => {
      setOnline(true)
      join()
    })
    socket.on('disconnect', () => {
      if (!stopped) setOnline(false)
    })
    socket.on('sync', (next) => {
      if (stopped) return
      setState(next)
      setOnline(true)
      setError('')
    })

    return () => {
      stopped = true
      socket.disconnect()
      if (socketRef.current === socket) socketRef.current = null
    }
  }, [code])

  async function advance() {
    const token = readHostToken(code)
    if (!token || state?.status === 'podium') return
    const socket = socketRef.current
    if (socket?.connected) {
      socket.timeout(4000).emit('host:advance', (err, res) => {
        if (err) {
          setOnline(false)
          return
        }
        if (res?.error && res.error !== 'Сейчас это действие недоступно') setError(res.error)
      })
      return
    }
    try {
      setState(await api.advanceRoom(code, token))
      setError('')
    } catch (err) {
      if (err.message !== 'Сейчас это действие недоступно') setError(err.message)
    }
  }

  return { state, error, online, advance }
}

// Ссылка для телефонов: если ведущий открыл сайт как localhost, подставляется адрес компьютера в локальной сети.
export function useJoinLink(code, enabled = true) {
  const [qr, setQr] = useState('')
  const [joinUrl, setJoinUrl] = useState('')

  useEffect(() => {
    if (!enabled) {
      setJoinUrl('')
      setQr('')
      return undefined
    }
    let ignore = false
    api.network().then((data) => {
      if (ignore) return
      const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
      const ip = data.addresses?.[0]
      const origin = local && ip ? `${location.protocol}//${ip}${location.port ? `:${location.port}` : ''}` : location.origin
      setJoinUrl(`${origin}/play/${code}`)
    }).catch(() => setJoinUrl(`${location.origin}/play/${code}`))
    return () => {
      ignore = true
    }
  }, [code, enabled])

  useEffect(() => {
    if (!joinUrl) {
      setQr('')
      return undefined
    }
    QRCode.toDataURL(joinUrl, { margin: 1, width: 360, color: { dark: '#17191f', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''))
    return undefined
  }, [joinUrl])

  return { joinUrl, qr }
}
