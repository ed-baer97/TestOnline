import { Link, useParams } from 'react-router-dom'
import { Brand } from '../../components/Brand.jsx'
import { BarChart, RateList } from '../../components/charts.jsx'
import { EnvControls } from '../../components/layout/topbar.jsx'
import { formatCode, formatWhen, shortWhen } from '../../lib/format.js'
import { useQuizStats } from '../../state/host/stats.js'
import { useI18n } from '../../state/i18n.jsx'

function launchWhen(session) {
  return session.startedAt || session.finishedAt
}

function launchLabel(session, lang, t) {
  const value = launchWhen(session)
  return value ? t('Запуск {when}', { when: formatWhen(value, lang) }) : t('Запуск')
}

function questionsOf(players) {
  const groups = new Map()
  const order = []
  for (const person of players) {
    for (const answer of person.answers || []) {
      const key = answer.questionId || answer.question
      if (!groups.has(key)) {
        groups.set(key, { text: answer.question, correct: 0, total: 0 })
        order.push(key)
      }
      const item = groups.get(key)
      item.total += 1
      if (answer.ok) item.correct += 1
    }
  }
  return order.map((key) => {
    const item = groups.get(key)
    return {
      text: item.text,
      rate: item.total ? Math.round((item.correct / item.total) * 100) : null,
      answered: item.total,
    }
  })
}

function scoreText(value) {
  return value == null ? '—' : String(value)
}

export default function Stats({ onLogout, base = '/host/quiz', listTo = '/host', embedded = false }) {
  const { lang, t } = useI18n()
  const { id, resultId, player } = useParams()
  const { stats, error } = useQuizStats(id)
  const statsTo = (suffix = '') => `${base}/${id}/stats${suffix}`

  if (error) {
    const errBody = (
      <>
        <p className="form-error">{t(error)}</p>
        <Link to={listTo}>{t('К списку квизов')}</Link>
      </>
    )
    if (embedded) return <section className="stack">{errBody}</section>
    return <main className="sheet">{errBody}</main>
  }
  if (!stats) return <p className="center muted">{t('Загрузка…')}</p>

  const session = resultId ? stats.sessions.find((item) => item.id === resultId) : null
  const playerIndex = player == null ? -1 : Number(player)
  const person = session && Number.isInteger(playerIndex) ? session.players[playerIndex] : null
  const heading = person ? `${person.rank}. ${person.name}` : session ? launchLabel(session, lang, t) : stats.title

  const body = (
    <>
      {person && session ? (
        <PlayerReport session={session} person={person} statsTo={statsTo} />
      ) : session ? (
        <SessionReport session={session} statsTo={statsTo} />
      ) : resultId ? (
        <p className="form-error">{t('Такой запуск не найден.')} <Link to={statsTo()}>{t('Ко всем запускам')}</Link></p>
      ) : (
        <QuizReport stats={stats} statsTo={statsTo} />
      )}
    </>
  )

  if (embedded) {
    return (
      <section className="stack editor">
        <p className="muted"><Link to={listTo}>{t('Квизы')}</Link> / {stats.title}</p>
        <div className="section-head">
          <h1>{heading}</h1>
          <Link className="ghost" to={`${base}/${id}`}>{t('Править')}</Link>
        </div>
        {body}
      </section>
    )
  }

  return (
    <main className="sheet editor">
      <header className="topbar">
        <Brand to={listTo.startsWith('/admin') ? '/admin' : '/host'} />
        <div className="top-actions">
          <Link to={`${base}/${id}`}>{t('Править')}</Link>
          <EnvControls />
          <button className="ghost" type="button" onClick={onLogout}>{t('Выйти')}</button>
        </div>
      </header>
      <p className="muted"><Link to={listTo}>{t('Квизы')}</Link> / {stats.title}</p>
      <h1>{heading}</h1>
      {body}
    </main>
  )
}

function Tiles({ items }) {
  const { t } = useI18n()
  return (
    <div className="stat-grid">
      {items.map((item) => (
        <article className="stat-card" key={item.label}>
          <span>{t(item.label)}</span>
          <strong>{item.value}</strong>
        </article>
      ))}
    </div>
  )
}

function meanScore(sessions) {
  const scores = sessions.flatMap((session) => (session.players || []).map((player) => Number(player.score) || 0))
  if (!scores.length) return null
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
}

function AccessReport({ title, sessions, statsTo }) {
  const { lang, t } = useI18n()
  const runs = [...sessions].reverse()
  const players = sessions.flatMap((session) => session.players || [])
  return (
    <section className="stack">
      <h2>{t(title)}</h2>
      <Tiles items={[
        { label: 'Запусков', value: sessions.length },
        { label: 'Участников', value: players.length },
        { label: 'Средний балл', value: scoreText(meanScore(sessions)) },
      ]} />
      {sessions.length === 0 ? (
        <p className="muted">{t('Пока пусто.')}</p>
      ) : (
        <>
          <div className="chart-grid">
            <BarChart
              caption={t('Участники по запускам')}
              items={runs.map((session) => ({ key: session.id, label: shortWhen(launchWhen(session), lang), value: session.playerCount }))}
            />
            <BarChart
              caption={t('Средний балл по запускам')}
              items={runs.map((session) => ({ key: session.id, label: shortWhen(launchWhen(session), lang), value: session.averageScore ?? 0 }))}
            />
          </div>
          <RateList caption={t('Верные ответы по вопросам')} items={questionsOf(players)} />
          <ul className="session-list">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link to={statsTo(`/${session.id}`)}>
                  <strong>{launchLabel(session, lang, t)}</strong>
                  <span>{t('код {code}', { code: formatCode(session.code) })}</span>
                  <span>{t('{count} участ.', { count: session.playerCount })}</span>
                  <span>{t('средний {score}', { score: scoreText(session.averageScore) })}</span>
                  <span>{t('лучший {score}', { score: scoreText(session.topScore) })}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function QuizReport({ stats, statsTo }) {
  const { t } = useI18n()
  const publicSessions = stats.sessions.filter((session) => session.access !== 'private')
  const privateSessions = stats.sessions.filter((session) => session.access === 'private')
  return (
    <>
      <Tiles items={[{ label: 'Вопросов', value: stats.questionCount }]} />
      {stats.runs === 0 ? (
        <p className="muted">{t('Этот квиз ещё не запускали. После игры здесь появятся баллы и ошибки.')}</p>
      ) : (
        <>
          <AccessReport title="Публичные" sessions={publicSessions} statsTo={statsTo} />
          <AccessReport title="Приватные" sessions={privateSessions} statsTo={statsTo} />
        </>
      )}
    </>
  )
}

function SessionReport({ session, statsTo }) {
  const { t } = useI18n()
  const questions = questionsOf(session.players)
  const answers = session.players.flatMap((person) => person.answers || [])
  const correctRate = answers.length ? Math.round((answers.filter((answer) => answer.ok).length / answers.length) * 100) : null
  return (
    <>
      <p className="muted">
        <Link to={statsTo()}>{t('Все запуски')}</Link> · {t(session.access === 'private' ? 'Приватный' : 'Публичный')} · {t('код {code}', { code: formatCode(session.code) })}
      </p>
      <Tiles items={[
        { label: 'Участников', value: session.playerCount },
        { label: 'Средний балл', value: scoreText(session.averageScore) },
        { label: 'Лучший балл', value: scoreText(session.topScore) },
        { label: 'Верных ответов', value: correctRate == null ? '—' : `${correctRate}%` },
      ]} />
      {session.playerCount === 0 ? <p className="muted">{t('В этой игре не было участников.')}</p> : (
        <div className="chart-grid">
          <BarChart
            caption={t('Баллы участников')}
            items={session.players.map((person) => ({ key: `${person.rank}-${person.name}`, label: person.name, value: person.score }))}
          />
          {questions.length > 0 && <RateList caption={t('Верные ответы в этом запуске')} items={questions} />}
        </div>
      )}
      <section className="results">
        <h2>{t('Участники')}</h2>
        <ul className="session-list">
          {session.players.map((person, index) => (
            <li key={`${person.rank}-${person.name}`}>
              <Link to={statsTo(`/${session.id}/${index}`)}>
                <strong>{person.rank}. {person.name}</strong>
                <span>{t('{score} очков', { score: person.score })}</span>
                <span>
                  {person.answers
                    ? t('верных {right} · ошибок {wrong}', {
                      right: person.answers.filter((answer) => answer.ok).length,
                      wrong: person.answers.filter((answer) => !answer.ok).length,
                    })
                    : t('ответы не сохранены')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function PlayerReport({ session, person, statsTo }) {
  const { t } = useI18n()
  const answers = person.answers
  const wrong = answers ? answers.filter((answer) => !answer.ok) : []
  const right = answers ? answers.filter((answer) => answer.ok) : []
  return (
    <section className="results">
      <p><Link to={statsTo(`/${session.id}`)}>{t('К участникам запуска')}</Link></p>
      <Tiles items={[
        { label: 'Баллы', value: person.score },
        { label: 'Место', value: person.rank },
        { label: 'Верных', value: answers ? right.length : '—' },
        { label: 'Неверных', value: answers ? wrong.length : '—' },
      ]} />
      {!answers && <p className="muted">{t('Этот запуск сохранён до подробной статистики: видны только место и баллы.')}</p>}
      {answers && (
        <>
          <h2>{t('Неправильные')}</h2>
          {wrong.length === 0 && <p className="muted">{t('Ошибок нет.')}</p>}
          <AnswerList answers={wrong} />
          <h2>{t('Правильные')}</h2>
          {right.length === 0 && <p className="muted">{t('Верных ответов нет.')}</p>}
          <AnswerList answers={right} />
        </>
      )}
    </section>
  )
}

function AnswerList({ answers }) {
  const { t } = useI18n()
  if (!answers.length) return null
  return (
    <div className="answer-review">
      {answers.map((answer, index) => (
        <article key={`${answer.question}-${index}`} className={answer.ok ? 'good' : 'bad'}>
          <h3>{answer.question}</h3>
          <p>{t('{label} · {points} очков', { label: t(answer.ok ? 'Верно' : 'Неверно'), points: answer.points })}</p>
          <p>{t('Ответ участника: {answer}', { answer: answer.chosen || t('нет ответа') })}</p>
          <p>{t('Правильный ответ: {answer}', { answer: answer.correct })}</p>
        </article>
      ))}
    </div>
  )
}
