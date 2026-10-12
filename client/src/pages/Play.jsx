import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, newId, playerKey } from '../api.js'
import { useI18n } from '../i18n.jsx'
import { COLOR_NAMES, SHAPES, Shape } from '../shapes.jsx'
import { useCountdown } from '../useCountdown.js'

export default function Play() {
  const { t } = useI18n()
  const { code } = useParams()
  const [info, setInfo] = useState(null)
  const [missing, setMissing] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [state, setState] = useState(null)
  const [online, setOnline] = useState(true)
  const [identity, setIdentity] = useState(() => sessionStorage.getItem(playerKey(code)) || '')
  const [me, setMe] = useState(undefined)
  const autoJoin = useRef(false)
  const seconds = useCountdown(state?.endsAt, state?.serverNow)

  useEffect(() => {
    api.room(code).then(setInfo).catch(() => setMissing(true))
  }, [code])

  useEffect(() => {
    api.me().then(setMe).catch(() => setMe({ ok: false }))
  }, [])

  useEffect(() => {
    if (info?.access !== 'private' || !me?.ok || identity || autoJoin.current) return
    autoJoin.current = true
    const token = sessionStorage.getItem(playerKey(code)) || newId()
    sessionStorage.setItem(playerKey(code), token)
    setName(me.displayName || me.login || '')
    setIdentity(token)
  }, [info, me, identity, code])

  useEffect(() => {
    if (!identity) return undefined
    let stopped = false
    api.joinRoom(code, { name, playerToken: identity }).catch((err) => {
      if (stopped) return
      sessionStorage.removeItem(playerKey(code))
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
    sessionStorage.setItem(playerKey(code), token)
    setError('')
    setIdentity(token)
  }

  if (missing) {
    return (
      <main className="center">
        <h1>{t('Комната не найдена')}</h1>
        <Link to="/">{t('На главную')}</Link>
      </main>
    )
  }

  if (!info || (info.access === 'private' && me === undefined)) return <p className="center muted">{t('Ищем комнату…')}</p>

  if (info.access === 'private' && !identity) {
    return (
      <main className="auth">
        <section className="card">
          <p className="brand">Saqbol</p>
          <h1>{info.title}</h1>
          <p className="muted">{t('Войдите под своим логином, чтобы подключиться к квизу.')}</p>
          {error && <p className="form-error">{t(error)}</p>}
          {!me?.ok && <Link className="primary" to="/login">{t('Войти')}</Link>}
        </section>
      </main>
    )
  }

  if (!identity) {
    return (
      <main className="auth">
        <form className="card" onSubmit={enter}>
          <p className="brand">Saqbol</p>
          <h1>{info.title}</h1>
          {info.joinable ? <p className="muted">{t('Напишите имя, которое увидит ведущий.')}</p> : <p className="form-error">{t('Игра уже началась. Войти можно было до старта.')}</p>}
          <label>
            {t('Ваше имя')}
            <input data-testid="nickname" maxLength={20} autoFocus value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          {error && <p className="form-error">{t(error)}</p>}
          <button className="primary" type="submit" disabled={!info.joinable}>{t('Войти в игру')}</button>
        </form>
      </main>
    )
  }

  if (!state) return <p className="center muted">{error ? t(error) : t('Подключаемся…')}</p>

  return <PlayerStage state={state} seconds={seconds} online={online} onAnswer={(optionIndex) => api.answerRoom(code, identity, optionIndex)} />
}

function PlayerStage({ state, seconds, online, onAnswer }) {
  const { t } = useI18n()
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
      {!online && <p className="banner">{t('Связь пропала, подключаемся снова…')}</p>}
      {state.status === 'lobby' && (
        <section className="wait">
          <h1>{t('Вы в игре')}</h1>
          <p>{t('Смотрите на экран ведущего. Сейчас в лобби: {count}.', { count: state.playerCount })}</p>
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
              <h2>{t('Ответ принят')}</h2>
              <p>{t('Ждём остальных.')}</p>
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
            <h2>{state.me?.answerIndex == null ? t('Время вышло') : state.me?.lastCorrect ? t('Верно') : t('Мимо')}</h2>
            <p>{state.me?.lastCorrect ? t('+{points}', { points: state.me.lastPoints }) : t('0 очков')}</p>
            <p>{t('Место: {rank} · всего {score}', { rank: state.me?.rank, score: state.me?.score })}</p>
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
          <h1>{state.me?.rank ? t('Вы на {rank} месте', { rank: state.me.rank }) : t('Итог')}</h1>
          <p className="lead">{t('{score} очков', { score: state.me?.score ?? 0 })}</p>
          <ol>
            {state.leaderboard.map((player) => (
              <li key={player.rank}>
                <span>{player.rank}</span>
                <strong>{player.name}</strong>
                <em>{player.score}</em>
              </li>
            ))}
          </ol>
          <Link to="/" className="text-link">{t('На главную')}</Link>
        </section>
      )}
      {socketError && <p className="form-error">{t(socketError)}</p>}
    </main>
  )
}
