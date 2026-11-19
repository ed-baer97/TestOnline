import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { api } from '../api/index.js'
import { newId } from '../lib/ids.js'
import { forgetPlayerToken, readPlayerToken, savePlayerToken } from './roomTokens.js'

// Телефон игрока: вход по имени и подключение к комнате по Socket.io.
// Токен живёт в sessionStorage, поэтому перезагрузка страницы возвращает игрока в ту же комнату.
export function usePlayerRoom(code) {
  const [info, setInfo] = useState(null)
  const [missing, setMissing] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [state, setState] = useState(null)
  const [online, setOnline] = useState(true)
  const [identity, setIdentity] = useState(() => readPlayerToken(code) || '')
  const socketRef = useRef(null)
  const nameRef = useRef(name)
  nameRef.current = name

  useEffect(() => {
    let alive = true
    setInfo(null)
    setMissing(false)
    setError('')
    setState(null)
    setOnline(true)
    setIdentity(readPlayerToken(code) || '')
    api.room(code)
      .then((data) => { if (alive) setInfo(data) })
      .catch(() => { if (alive) setMissing(true) })
    return () => { alive = false }
  }, [code])

  useEffect(() => {
    if (!identity) return undefined
    const socket = io({ withCredentials: true })
    socketRef.current = socket
    let stopped = false

    const join = () => {
      socket.timeout(8000).emit('player:join', { code, name: nameRef.current, playerToken: identity }, (err, res) => {
        if (stopped) return
        if (err) {
          setOnline(false)
          return
        }
        if (res?.error) {
          forgetPlayerToken(code)
          setIdentity('')
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
    })

    return () => {
      stopped = true
      socket.disconnect()
      if (socketRef.current === socket) socketRef.current = null
    }
  }, [code, identity])

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
    const socket = socketRef.current
    if (socket?.connected) {
      return new Promise((resolve, reject) => {
        socket.timeout(4000).emit('player:answer', { optionIndex }, (err, res) => {
          if (err) reject(new Error('Связь пропала, подключаемся снова…'))
          else resolve(res)
        })
      })
    }
    return api.answerRoom(code, identity, optionIndex)
  }

  return { info, missing, name, setName, error, state, online, identity, enter, answer }
}
