import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Brand } from '../../components/Brand.jsx'
import { FitText } from '../../components/FitText.jsx'
import { EnvControls } from '../../components/layout/topbar.jsx'
import { COLOR_NAMES, SHAPES, Shape } from '../../components/shapes.jsx'
import { useCountdown } from '../../state/countdown.js'
import { useI18n } from '../../state/i18n.jsx'
import { usePlayerRoom } from '../../state/playerRoom.js'

export default function Play() {
  const { t } = useI18n()
  const { code } = useParams()
  const { info, missing, name, setName, error, state, online, identity, me, enter, answer } = usePlayerRoom(code)
  const seconds = useCountdown(state?.endsAt, state?.serverNow)

  if (missing) {
    return (
      <main className="center">
        <EnvControls />
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
          <div className="auth-top">
            <Brand to="/" />
            <EnvControls />
          </div>
          <h1 className="quiz-title">{info.title}</h1>
          <p className="muted">{t('Войдите под своим логином, чтобы подключиться к квизу.')}</p>
          {error && <p className="form-error">{t(error)}</p>}
          {!me?.ok && <Link className="primary" to="/login">{t('Войти')}</Link>}
          {me?.ok && me.role === 'learner' && <Link className="ghost" to="/learn">{t('На главную')}</Link>}
        </section>
      </main>
    )
  }

  if (!identity) {
    return (
      <main className="auth">
        <form className="card" onSubmit={enter}>
          <div className="auth-top">
            <Brand to="/" />
            <EnvControls />
          </div>
          <h1 className="quiz-title">{info.title}</h1>
          {info.joinable
            ? <p className="muted">{t('Напишите имя, которое увидит ведущий.')}</p>
            : <p className="form-error">{t('Игра уже началась. Войти можно было до старта.')}</p>}
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

  if (!state) return <p className="center muted">{t(error) || t('Подключаемся…')}</p>

  return <PlayerStage state={state} seconds={seconds} online={online} onAnswer={answer} />
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

  const sendRef = useRef(send)
  sendRef.current = send

  useEffect(() => {
    if (state.status !== 'question' || state.me?.answered || !state.question) return undefined
    const optionCount = state.question.options.length
    const onKey = (event) => {
      const index = Number(event.key) - 1
      if (index >= 0 && index < optionCount) sendRef.current(index)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.status, state.me?.answered, state.question])

  return (
    <main className="play">
      <header>
        <span>{state.me?.name}</span>
        <div className="top-actions">
          <strong>{state.me?.score ?? 0}</strong>
          <EnvControls />
        </div>
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
                  <FitText text={option.text} />
                </button>
              ))}
            </div>
          )}
        </section>
      )}
      {state.status === 'reveal' && state.question && (
        <section className="play-question">
          <div className={`locked ${state.me?.lastCorrect ? 'green' : 'red'}`}>
            <h2>{t(state.me?.answerIndex == null ? 'Время вышло' : state.me?.lastCorrect ? 'Верно' : 'Мимо')}</h2>
            <p>{state.me?.lastCorrect ? t('+{points}', { points: state.me.lastPoints }) : t('0 очков')}</p>
            <p>{t('Место: {rank} · всего {score}', { rank: state.me?.rank, score: state.me?.score })}</p>
          </div>
          <div className="answer-grid compact">
            {state.question.options.map((option) => (
              <div key={option.index} className={`answer ${COLOR_NAMES[option.index]} ${option.index === state.question.correctIndex ? 'correct' : 'dim'}`}>
                <FitText text={option.text} max={20} />
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
