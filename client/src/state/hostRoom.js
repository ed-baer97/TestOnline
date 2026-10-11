import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { api } from '../api/index.js'
import { readHostToken } from './roomTokens.js'

// Экран ведущего опрашивает комнату раз в секунду по токену из sessionStorage.
export function useHostRoom(code) {
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const token = readHostToken(code)
    if (!token) {
      setError('Откройте комнату кнопкой «Запустить» в панели ведущего.')
      return undefined
    }
    let stopped = false
    async function pull() {
      try {
        const next = await api.hostRoom(code, token)
        if (stopped) return
        setState(next)
        setOnline(true)
        setError('')
      } catch (err) {
        if (stopped) return
        setOnline(false)
        setError(err.message)
      }
    }
    pull()
    const timer = setInterval(pull, 1000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [code])

  async function advance() {
    const token = readHostToken(code)
    if (!token || state?.status === 'podium') return
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
export function useJoinLink(code) {
  const [qr, setQr] = useState('')
  const [joinUrl, setJoinUrl] = useState('')

  useEffect(() => {
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
  }, [code])

  useEffect(() => {
    if (!joinUrl) return undefined
    QRCode.toDataURL(joinUrl, { margin: 1, width: 360, color: { dark: '#17191f', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''))
    return undefined
  }, [joinUrl])

  return { joinUrl, qr }
}
