import { useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Brand } from '../../components/Brand.jsx'
import { FitText } from '../../components/FitText.jsx'
import { EnvControls } from '../../components/layout/topbar.jsx'
import { COLOR_NAMES, SHAPES, Shape } from '../../components/shapes.jsx'
import { formatCode } from '../../lib/format.js'
import { useCountdown } from '../../state/countdown.js'
import { useHostRoom, useJoinLink } from '../../state/hostRoom.js'
import { pick, useI18n } from '../../state/i18n.jsx'
import { useSession } from '../../state/session.js'

export default function HostRoom() {
  const { lang, t } = useI18n()
  const { code } = useParams()
  const me = useSession()
  const backTo = ['super', 'regional', 'org'].includes(me?.role) ? '/admin/quizzes' : '/host'
  const { state, error, online, advance } = useHostRoom(code)
  const { joinUrl, qr } = useJoinLink(code, state?.access === 'public')
  const seconds = useCountdown(state?.endsAt, state?.serverNow)
  const advanceRef = useRef(advance)
  advanceRef.current = advance

  useEffect(() => {
    const onKey = (event) => {
      if (event.target.closest('input, textarea, button, a')) return
      if (event.code === 'Space' || event.key === 'ArrowRight') {
        event.preventDefault()
        advanceRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (error && !state) {
    return (
      <main className="center">
        <EnvControls />
        <p>{t(error)}</p>
        <Link to={backTo}>{t('К квизам')}</Link>
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
        <Brand to={backTo} />
        <strong data-testid="pin">{formatCode(state.code)}</strong>
        <div className="top-actions">
          <span>{state.status === 'lobby' ? t('Лобби') : state.status === 'podium' ? t('Итог') : `${state.questionIndex + 1} / ${state.questionCount}`}</span>
          <EnvControls />
        </div>
      </header>
      {!online && <p className="banner">{t('Связь пропала, подключаемся снова…')}</p>}
      {state.status === 'lobby' && (
        <section className="lobby">
          <div>
            <h1 className="quiz-title">{state.title}</h1>
            {state.access === 'private' ? (
              <p className="lead">
                {t('Квиз для {org}, {klass}. Участники заходят из кабинета под своими логинами.', {
                  org: pick(lang, state.organizationName, state.organizationNameKk),
                  klass: t(state.classLabel),
                })}
              </p>
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
                  <FitText text={option.text} max={32} />
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
      {state.status === 'podium' && <Link className="primary advance" to={backTo}>{t('К квизам')}</Link>}
      {error && <p className="form-error center-error">{t(error)}</p>}
    </main>
  )
}
