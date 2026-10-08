import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import { api, newId, playerKey } from '../api.js'
import { COLOR_NAMES, SHAPES, Shape } from '../shapes.jsx'
import { useCountdown } from '../useCountdown.js'

export default function Play() {
  const { code } = useParams()
  const socketRef = useRef(null)
  const [info, setInfo] = useState(null)
  const [missing, setMissing] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [state, setState] = useState(null)
  const [online, setOnline] = useState(true)
  const [identity, setIdentity] = useState(() => sessionStorage.getItem(playerKey(code)) || '')
  const seconds = useCountdown(state?.endsAt, state?.serverNow)

  useEffect(() => {
    api.room(code).then(setInfo).catch(() => setMissing(true))
  }, [code])

  useEffect(() => {
    if (!identity) return undefined
    const socket = io({ transports: ['websocket', 'polling'] })
    socketRef.current = socket
    let stopped = false
    const join = () => {
      if (stopped) return
      socket.emit('player:join', { code, name, playerToken: identity }, (res) => {
        if (stopped) return
        if (res?.error) {
          stopped = true
          sessionStorage.removeItem(playerKey(code))
          setIdentity('')
          setError(res.error)
          socket.disconnect()
        }
      })
    }
    socket.on('connect', () => {
      setOnline(true)
      join()
    })
    socket.on('disconnect', () => setOnline(false))
    socket.on('sync', setState)
    return () => {
      stopped = true
      socketRef.current = null
      socket.disconnect()
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
    sessionStorage.setItem(playerKey(code), token)
    setError('')
    setIdentity(token)
  }

  if (missing) {
    return (
      <main className="center">
        <h1>Комната не найдена</h1>
        <Link to="/">На главную</Link>
      </main>
    )
  }

  if (!info) return <p className="center muted">Ищем комнату…</p>

  if (!identity) {
    return (
      <main className="auth">
        <form className="card" onSubmit={enter}>
          <p className="brand">TestOnline</p>
          <h1>{info.title}</h1>
          {info.joinable ? <p className="muted">Напишите имя, которое увидит ведущий.</p> : <p className="form-error">Игра уже началась. Войти можно было до старта.</p>}
          <label>
            Ваше имя
            <input data-testid="nickname" maxLength={20} autoFocus value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary" type="submit" disabled={!info.joinable}>Войти в игру</button>
        </form>
      </main>
    )
  }

  if (!state) return <p className="center muted">Подключаемся…</p>

  return <PlayerStage socketRef={socketRef} state={state} seconds={seconds} online={online} />
}

function PlayerStage({ socketRef, state, seconds, online }) {
  const [socketError, setSocketError] = useState('')
  const [pendingIndex, setPendingIndex] = useState(null)
  const sent = useRef(false)
  const selected = state.me?.answerIndex ?? pendingIndex

  useEffect(() => {
    sent.current = false
    setPendingIndex(null)
    setSocketError('')
  }, [state.questionIndex, state.status])

  function send(optionIndex) {
    if (state.status !== 'question' || state.me?.answered || sent.current) return
    const socket = socketRef.current
    if (!socket || !state.question) return
    sent.current = true
    setPendingIndex(optionIndex)
    socket.emit('player:answer', { optionIndex }, (res) => {
      if (res?.ok) return
      sent.current = false
      setPendingIndex(null)
      if (res?.error && res.error !== 'Ответ уже принят') setSocketError(res.error)
    })
  }

  useEffect(() => {
    if (state.status !== 'question' || state.me?.answered || !state.question) return undefined
    const onKey = (event) => {
      const index = Number(event.key) - 1
      if (index >= 0 && index < state.question.options.length) send(index)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <main className="play">
      <header>
        <span>{state.me?.name}</span>
        <strong>{state.me?.score ?? 0}</strong>
      </header>
      {!online && <p className="banner">Связь пропала, подключаемся снова…</p>}
      {state.status === 'lobby' && (
        <section className="wait">
          <h1>Вы в игре</h1>
          <p>Смотрите на экран ведущего. Сейчас в лобби: {state.playerCount}.</p>
        </section>
      )}
      {state.status === 'question' && state.question && (
        <section className="play-question">
          <div className="play-meta">
            <h1>{state.question.text}</h1>
            <p className={seconds != null && seconds <= 5 ? 'danger' : ''}>{seconds ?? ''}</p>
          </div>
          {state.me?.answered || pendingIndex != null ? (
            <div className={`locked ${COLOR_NAMES[selected] || ''}`}>
              <h2>Ответ принят</h2>
              <p>Ждём остальных.</p>
            </div>
          ) : (
            <div className="answer-grid">
              {state.question.options.map((option) => (
                <button key={option.index} className={`answer ${COLOR_NAMES[option.index]}`} type="button" data-testid={`answer-${option.index}`} onClick={() => send(option.index)}>
                  <Shape name={SHAPES[option.index]} />
                  <span>{option.text}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
      {state.status === 'reveal' && state.question && (
        <section className="play-question">
          <div className={`locked ${state.me?.lastCorrect ? 'green' : 'red'}`}>
            <h2>{state.me?.answerIndex == null ? 'Время вышло' : state.me?.lastCorrect ? 'Верно' : 'Мимо'}</h2>
            <p>{state.me?.lastCorrect ? `+${state.me.lastPoints}` : '0 очков'}</p>
            <p>Место: {state.me?.rank} · всего {state.me?.score}</p>
          </div>
          <div className="answer-grid compact">
            {state.question.options.map((option) => (
              <div key={option.index} className={`answer ${COLOR_NAMES[option.index]} ${option.index === state.question.correctIndex ? 'correct' : 'dim'}`}>
                <span>{option.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      {state.status === 'podium' && (
        <section className="podium player-podium">
          <h1>{state.me?.rank ? `Вы на ${state.me.rank} месте` : 'Итог'}</h1>
          <p className="lead">{state.me?.score ?? 0} очков</p>
          <ol>
            {state.leaderboard.map((player) => (
              <li key={player.rank}>
                <span>{player.rank}</span>
                <strong>{player.name}</strong>
                <em>{player.score}</em>
              </li>
            ))}
          </ol>
          <Link to="/" className="text-link">На главную</Link>
        </section>
      )}
      {socketError && <p className="form-error">{socketError}</p>}
    </main>
  )
}
