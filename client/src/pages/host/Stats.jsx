import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../api/index.js'
import { formatCode, formatWhen, shortWhen } from '../../lib/format.js'
import { BarChart, RateList } from '../../components/charts.jsx'

function launchWhen(session) {
  return session.startedAt || session.finishedAt
}

function launchLabel(session) {
  const value = launchWhen(session)
  return value ? `Запуск ${formatWhen(value)}` : 'Запуск'
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
    }
  })
}

function scoreText(value) {
  return value == null ? '—' : String(value)
}

export default function Stats({ onLogout }) {
  const { id, resultId, player } = useParams()
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.quizStats(id).then(setStats).catch((err) => setError(err.message))
  }, [id])

  if (error) {
    return (
      <main className="sheet">
        <p className="form-error">{error}</p>
        <Link to="/host">К списку квизов</Link>
      </main>
    )
  }
  if (!stats) return <p className="center muted">Загрузка…</p>

  const session = resultId ? stats.sessions.find((item) => item.id === resultId) : null
  const playerIndex = player == null ? -1 : Number(player)
  const person = session && Number.isInteger(playerIndex) ? session.players[playerIndex] : null

  return (
    <main className="sheet editor">
      <header className="topbar">
        <Link className="brand" to="/host">TestOnline</Link>
        <div className="top-actions">
          <Link to={`/host/quiz/${id}`}>Править</Link>
          <button className="ghost" type="button" onClick={onLogout}>Выйти</button>
        </div>
      </header>
      <p className="muted"><Link to="/host">Квизы</Link> / {stats.title}</p>
      <h1>{person ? `${person.rank}. ${person.name}` : session ? launchLabel(session) : stats.title}</h1>

      {person && session ? (
        <PlayerReport quizId={id} session={session} person={person} />
      ) : session ? (
        <SessionReport quizId={id} session={session} />
      ) : resultId ? (
        <p className="form-error">Такой запуск не найден. <Link to={`/host/quiz/${id}/stats`}>Ко всем запускам</Link></p>
      ) : (
        <QuizReport stats={stats} />
      )}
    </main>
  )
}

function Tiles({ items }) {
  return (
    <div className="stat-grid">
      {items.map((item) => (
        <article className="stat-card" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </article>
      ))}
    </div>
  )
}

function QuizReport({ stats }) {
  const runs = [...stats.sessions].reverse()
  return (
    <>
      <Tiles items={[
        { label: 'Запусков', value: stats.runs },
        { label: 'Участников', value: stats.participants },
        { label: 'Средний балл', value: scoreText(stats.averageScore) },
        { label: 'Вопросов', value: stats.questionCount },
      ]} />
      {stats.runs === 0 ? (
        <p className="muted">Этот квиз ещё не запускали. После игры здесь появятся баллы и ошибки.</p>
      ) : (
        <div className="chart-grid">
          <BarChart
            caption="Участники по запускам"
            items={runs.map((session) => ({ key: session.id, label: shortWhen(launchWhen(session)), value: session.playerCount }))}
          />
          <BarChart
            caption="Средний балл по запускам"
            items={runs.map((session) => ({ key: session.id, label: shortWhen(launchWhen(session)), value: session.averageScore ?? 0 }))}
          />
        </div>
      )}
      <RateList caption="Верные ответы по вопросам" items={stats.questions} />
      <section className="results">
        <h2>Запуски</h2>
        {stats.sessions.length === 0 && <p className="muted">Пока пусто.</p>}
        <ul className="session-list">
          {stats.sessions.map((session) => (
            <li key={session.id}>
              <Link to={`/host/quiz/${stats.id}/stats/${session.id}`}>
                <strong>{launchLabel(session)}</strong>
                <span>код {formatCode(session.code)}</span>
                <span>{session.playerCount} участ.</span>
                <span>средний {scoreText(session.averageScore)}</span>
                <span>лучший {scoreText(session.topScore)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function SessionReport({ quizId, session }) {
  const questions = questionsOf(session.players)
  const answers = session.players.flatMap((person) => person.answers || [])
  const correctRate = answers.length ? Math.round((answers.filter((answer) => answer.ok).length / answers.length) * 100) : null
  return (
    <>
      <p className="muted"><Link to={`/host/quiz/${quizId}/stats`}>Все запуски</Link> · код {formatCode(session.code)}</p>
      <Tiles items={[
        { label: 'Участников', value: session.playerCount },
        { label: 'Средний балл', value: scoreText(session.averageScore) },
        { label: 'Лучший балл', value: scoreText(session.topScore) },
        { label: 'Верных ответов', value: correctRate == null ? '—' : `${correctRate}%` },
      ]} />
      {session.playerCount === 0 ? <p className="muted">В этой игре не было участников.</p> : (
        <div className="chart-grid">
          <BarChart
            caption="Баллы участников"
            items={session.players.map((person) => ({ key: `${person.rank}-${person.name}`, label: person.name, value: person.score }))}
          />
          {questions.length > 0 && <RateList caption="Верные ответы в этом запуске" items={questions} />}
        </div>
      )}
      <section className="results">
        <h2>Участники</h2>
        <ul className="session-list">
          {session.players.map((person, index) => (
            <li key={`${person.rank}-${person.name}`}>
              <Link to={`/host/quiz/${quizId}/stats/${session.id}/${index}`}>
                <strong>{person.rank}. {person.name}</strong>
                <span>{person.score} очков</span>
                <span>{person.answers ? `верных ${person.answers.filter((answer) => answer.ok).length} · ошибок ${person.answers.filter((answer) => !answer.ok).length}` : 'ответы не сохранены'}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function PlayerReport({ quizId, session, person }) {
  const answers = person.answers
  const wrong = answers ? answers.filter((answer) => !answer.ok) : []
  const right = answers ? answers.filter((answer) => answer.ok) : []
  return (
    <section className="results">
      <p><Link to={`/host/quiz/${quizId}/stats/${session.id}`}>К участникам запуска</Link></p>
      <Tiles items={[
        { label: 'Баллы', value: person.score },
        { label: 'Место', value: person.rank },
        { label: 'Верных', value: answers ? right.length : '—' },
        { label: 'Неверных', value: answers ? wrong.length : '—' },
      ]} />
      {!answers && <p className="muted">Этот запуск сохранён до подробной статистики: видны только место и баллы.</p>}
      {answers && (
        <>
          <h2>Неправильные</h2>
          {wrong.length === 0 && <p className="muted">Ошибок нет.</p>}
          <AnswerList answers={wrong} />
          <h2>Правильные</h2>
          {right.length === 0 && <p className="muted">Верных ответов нет.</p>}
          <AnswerList answers={right} />
        </>
      )}
    </section>
  )
}

function AnswerList({ answers }) {
  if (!answers.length) return null
  return (
    <div className="answer-review">
      {answers.map((answer, index) => (
        <article key={`${answer.question}-${index}`} className={answer.ok ? 'good' : 'bad'}>
          <h3>{answer.question}</h3>
          <p>{answer.ok ? 'Верно' : 'Неверно'} · {answer.points} очков</p>
          <p>Ответ участника: {answer.chosen || 'нет ответа'}</p>
          <p>Правильный ответ: {answer.correct}</p>
        </article>
      ))}
    </div>
  )
}
