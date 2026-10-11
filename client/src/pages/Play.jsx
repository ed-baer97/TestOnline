import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCountdown } from '../state/countdown.js'
import { usePlayerRoom } from '../state/playerRoom.js'
import { COLOR_NAMES, SHAPES, Shape } from '../components/shapes.jsx'

export default function Play() {
  const { code } = useParams()
  const { info, missing, name, setName, error, state, online, identity, enter, answer } = usePlayerRoom(code)
  const seconds = useCountdown(state?.endsAt, state?.serverNow)

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

  if (!state) return <p className="center muted">{error || 'Подключаемся…'}</p>

  return <PlayerStage state={state} seconds={seconds} online={online} onAnswer={answer} />
}

function PlayerStage({ state, seconds, online, onAnswer }) {
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
    if (!state.question) return
    sent.current = true
    setPendingIndex(optionIndex)
    onAnswer(optionIndex).then((res) => {
      if (res?.ok) return
      sent.current = false
      setPendingIndex(null)
      if (res?.error && res.error !== 'Ответ уже принят') setSocketError(res.error)
    }).catch((err) => {
      sent.current = false
      setPendingIndex(null)
      if (err.message !== 'Ответ уже принят') setSocketError(err.message)
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
