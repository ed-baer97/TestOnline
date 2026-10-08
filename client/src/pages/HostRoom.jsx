import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { io } from 'socket.io-client'
import { api, formatCode, hostKey } from '../api.js'
import { COLOR_NAMES, SHAPES, Shape } from '../shapes.jsx'
import { useCountdown } from '../useCountdown.js'

export default function HostRoom() {
  const { code } = useParams()
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  const [online, setOnline] = useState(true)
  const [qr, setQr] = useState('')
  const [joinUrl, setJoinUrl] = useState('')
  const [socket, setSocket] = useState(null)
  const seconds = useCountdown(state?.endsAt, state?.serverNow)

  useEffect(() => {
    const token = sessionStorage.getItem(hostKey(code))
    if (!token) {
      setError('Откройте комнату кнопкой «Запустить» в панели ведущего.')
      return undefined
    }
    const next = io({ transports: ['polling', 'websocket'] })
    let stopped = false
    const join = () => {
      if (stopped) return
      next.emit('host:join', { code, hostToken: token }, (res) => {
        if (stopped) return
        if (res?.error) {
          stopped = true
          setError(res.error)
          next.disconnect()
        }
      })
    }
    next.on('connect', () => {
      setOnline(true)
      join()
    })
    next.on('connect_error', () => {
      if (!stopped) setError('Не удалось подключиться к комнате. Обновите страницу.')
    })
    next.on('disconnect', () => setOnline(false))
    next.on('sync', (nextState) => {
      setState(nextState)
      if (nextState.status === 'podium') setError('')
    })
    setSocket(next)
    return () => {
      stopped = true
      next.disconnect()
    }
  }, [code])

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

  function advance() {
    if (!socket || state?.status === 'podium') return
    socket.emit('host:advance', (res) => {
      if (res?.error && res.error !== 'Сейчас это действие недоступно') setError(res.error)
    })
  }

  useEffect(() => {
    const onKey = (event) => {
      if (event.target.closest('input, textarea, button, a')) return
      if (event.code === 'Space' || event.key === 'ArrowRight') {
        event.preventDefault()
        advance()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (error && !state) {
    return (
      <main className="center">
        <p>{error}</p>
        <Link to="/host">К квизам</Link>
      </main>
    )
  }

  if (!state) return <p className="center muted">Подключаем комнату…</p>

  const lastReveal = state.status === 'reveal' && state.questionIndex === state.questionCount - 1
  const actionLabel = state.status === 'lobby'
    ? 'Начать игру'
    : state.status === 'question'
      ? 'Показать ответ'
      : lastReveal
        ? 'К результатам'
        : 'Дальше'

  return (
    <main className="stage">
      <header className="stage-bar">
        <Link to="/host">TestOnline</Link>
        <strong data-testid="pin">{formatCode(state.code)}</strong>
        <span>{state.status === 'lobby' ? 'Лобби' : state.status === 'podium' ? 'Итог' : `${state.questionIndex + 1} / ${state.questionCount}`}</span>
      </header>
      {!online && <p className="banner">Связь пропала, подключаемся снова…</p>}
      {state.status === 'lobby' && (
        <section className="lobby">
          <div>
            <h1>{state.title}</h1>
            <p className="lead">Покажите QR-код. Телефоны откроют игру сами, вводить код не нужно.</p>
            {joinUrl && <p className="join-url">{joinUrl}</p>}
            {joinUrl.includes('localhost') && <p className="form-error">Телефоны не откроют localhost. Зайдите на этот компьютер по адресу в локальной сети.</p>}
            <p className="count">{state.playerCount} в лобби</p>
            <div className="chips">
              {state.players.map((player) => (
                <span key={player.id} className={player.online ? '' : 'off'}>{player.name}</span>
              ))}
            </div>
          </div>
          {qr && <img className="qr" src={qr} alt="QR-код для входа в игру" />}
        </section>
      )}
      {(state.status === 'question' || state.status === 'reveal') && state.question && (
        <section className="question-stage">
          <div className="question-head">
            <h1>{state.question.text}</h1>
            {state.status === 'question' && <p className={`timer ${seconds != null && seconds <= 5 ? 'danger' : ''}`}>{seconds ?? state.question.timeLimit}</p>}
            <p className="muted">Ответили {state.answeredCount} из {state.playerCount}</p>
          </div>
          <div className="answer-grid host-grid">
            {state.question.options.map((option) => {
              const correct = state.status === 'reveal' && option.index === state.question.correctIndex
              const count = state.question.optionCounts?.[option.index] || 0
              const total = Math.max(state.answeredCount, 1)
              return (
                <div key={option.index} className={`answer ${COLOR_NAMES[option.index]} ${correct ? 'correct' : ''} ${state.status === 'reveal' && !correct ? 'dim' : ''}`}>
                  <Shape name={SHAPES[option.index]} />
                  <span>{option.text}</span>
                  {state.status === 'reveal' && <b style={{ width: `${(count / total) * 100}%` }} />}
                  {state.status === 'reveal' && <em>{count}</em>}
                </div>
              )
            })}
          </div>
        </section>
      )}
      {state.status === 'podium' && (
        <section className="podium">
          <h1>Итог</h1>
          <ol>
            {state.leaderboard.slice(0, 10).map((player) => (
              <li key={player.rank}>
                <span>{player.rank}</span>
                <strong>{player.name}</strong>
                <em>{player.score}</em>
              </li>
            ))}
          </ol>
          {state.leaderboard.length === 0 && <p className="muted">В этой игре не было участников.</p>}
        </section>
      )}
      {state.status !== 'podium' && (
        <button className="primary advance" type="button" onClick={advance}>{actionLabel}</button>
      )}
      {state.status === 'podium' && <Link className="primary advance" to="/host">К квизам</Link>}
      {error && <p className="form-error center-error">{error}</p>}
    </main>
  )
}
