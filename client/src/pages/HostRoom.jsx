import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { io } from 'socket.io-client'
import { api, formatCode, hostKey } from '../api.js'
import { pick, useI18n } from '../i18n.jsx'
import { AnswerText, COLOR_NAMES, SHAPES, Shape } from '../shapes.jsx'
import { useCountdown } from '../useCountdown.js'

export default function HostRoom() {
  const { lang, t } = useI18n()
  const { code } = useParams()
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  const [online, setOnline] = useState(true)
  const [qr, setQr] = useState('')
  const [joinUrl, setJoinUrl] = useState('')
  const socketRef = useRef(null)
  const seconds = useCountdown(state?.endsAt, state?.serverNow)

  useEffect(() => {
    const token = sessionStorage.getItem(hostKey(code))
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
    const socket = socketRef.current
    if (!socket?.connected || state?.status === 'podium') return
    socket.timeout(8000).emit('host:advance', (err, res) => {
      if (err) {
        setError('Связь пропала, подключаемся снова…')
        return
      }
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
        <p>{t(error)}</p>
        <Link to="/host">{t('К квизам')}</Link>
      </main>
    )
  }

  if (!state) return <p className="center muted">{t('Подключаем комнату…')}</p>

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
        <Link to="/host">Saqbol</Link>
        <strong data-testid="pin">{formatCode(state.code)}</strong>
        <span>{state.status === 'lobby' ? t('Лобби') : state.status === 'podium' ? t('Итог') : `${state.questionIndex + 1} / ${state.questionCount}`}</span>
      </header>
      {!online && <p className="banner">{t('Связь пропала, подключаемся снова…')}</p>}
      {state.status === 'lobby' && (
        <section className="lobby">
          <div>
            <h1>{state.title}</h1>
            {state.access === 'private' ? (
              <p className="lead">{t('Квиз для {org}, {klass}. Участники заходят из кабинета под своими логинами.', { org: pick(lang, state.organizationName, state.organizationNameKk), klass: state.classLabel })}</p>
            ) : (
              <>
                <p className="lead">{t('Покажите QR-код. Телефоны откроют игру сами, вводить код не нужно.')}</p>
                {joinUrl && <p className="join-url">{joinUrl}</p>}
                {joinUrl.includes('localhost') && <p className="form-error">{t('Телефоны не откроют localhost. Зайдите на этот компьютер по адресу в локальной сети.')}</p>}
              </>
            )}
            <p className="count">{t('{count} в лобби', { count: state.playerCount })}</p>
            <div className="chips">
              {state.players.map((player) => (
                <span key={player.id} className={player.online ? '' : 'off'}>{player.name}</span>
              ))}
            </div>
          </div>
          {state.access !== 'private' && qr && <img className="qr" src={qr} alt={t('QR-код для входа в игру')} />}
        </section>
      )}
      {(state.status === 'question' || state.status === 'reveal') && state.question && (
        <section className="question-stage">
          <div className="question-head">
            <h1>{state.question.text}</h1>
            {state.status === 'question' && <p className={`timer ${seconds != null && seconds <= 5 ? 'danger' : ''}`}>{seconds ?? state.question.timeLimit}</p>}
            <p className="muted">{t('Ответили {answered} из {total}', { answered: state.answeredCount, total: state.playerCount })}</p>
          </div>
          <div className="answer-grid host-grid">
            {state.question.options.map((option) => {
              const correct = state.status === 'reveal' && option.index === state.question.correctIndex
              const count = state.question.optionCounts?.[option.index] || 0
              const total = Math.max(state.answeredCount, 1)
              return (
                <div key={option.index} className={`answer ${COLOR_NAMES[option.index]} ${correct ? 'correct' : ''} ${state.status === 'reveal' && !correct ? 'dim' : ''}`}>
                  <Shape name={SHAPES[option.index]} />
                  <AnswerText text={option.text} />
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
          <h1>{t('Итог')}</h1>
          <ol>
            {state.leaderboard.slice(0, 10).map((player) => (
              <li key={player.rank}>
                <span>{player.rank}</span>
                <strong>{player.name}</strong>
                <em>{player.score}</em>
              </li>
            ))}
          </ol>
          {state.leaderboard.length === 0 && <p className="muted">{t('В этой игре не было участников.')}</p>}
        </section>
      )}
      {state.status !== 'podium' && (
        <button className="primary advance" type="button" onClick={advance}>{t(actionLabel)}</button>
      )}
      {state.status === 'podium' && <Link className="primary advance" to="/host">{t('К квизам')}</Link>}
      {error && <p className="form-error center-error">{t(error)}</p>}
    </main>
  )
}
