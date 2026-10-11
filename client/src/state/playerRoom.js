import { useEffect, useState } from 'react'
import { api } from '../api/index.js'
import { newId } from '../lib/ids.js'
import { forgetPlayerToken, readPlayerToken, savePlayerToken } from './roomTokens.js'

// Телефон игрока: вход по имени, затем опрос комнаты раз в секунду по токену игрока.
// Токен живёт в sessionStorage, поэтому перезагрузка страницы возвращает игрока в ту же комнату.
export function usePlayerRoom(code) {
  const [info, setInfo] = useState(null)
  const [missing, setMissing] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [state, setState] = useState(null)
  const [online, setOnline] = useState(true)
  const [identity, setIdentity] = useState(() => readPlayerToken(code) || '')

  useEffect(() => {
    api.room(code).then(setInfo).catch(() => setMissing(true))
  }, [code])

  useEffect(() => {
    if (!identity) return undefined
    let stopped = false
    api.joinRoom(code, { name, playerToken: identity }).catch((err) => {
      if (stopped) return
      forgetPlayerToken(code)
      setIdentity('')
      setError(err.message)
    })
    async function pull() {
      try {
        const next = await api.playRoom(code, identity)
        if (stopped) return
        setState(next)
        setOnline(true)
      } catch {
        if (!stopped) setOnline(false)
      }
    }
    pull()
    const timer = setInterval(pull, 1000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [code, identity, name])

  function enter(event) {
    event.preventDefault()
    const nickname = name.trim()
    if (nickname.length < 2) {
      setError('Имя от 2 до 20 символов')
      return
    }
    const token = newId()
    savePlayerToken(code, token)
    setError('')
    setIdentity(token)
  }

  function answer(optionIndex) {
    return api.answerRoom(code, identity, optionIndex)
  }

  return { info, missing, name, setName, error, state, online, identity, enter, answer }
}
