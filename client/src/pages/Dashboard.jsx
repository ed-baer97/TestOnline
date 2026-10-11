import { useEffect, useState } from 'react'
import { api } from '../api/index.js'
import { BarChart } from '../charts.jsx'
import { HostFrame } from './HostFrame.jsx'

export default function Dashboard({ onLogout }) {
  const [stats, setStats] = useState(null)
  const [account, setAccount] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.stats(), api.me()])
      .then(([statsData, me]) => {
        setStats(statsData)
        setAccount(me.login || '')
      })
      .catch((err) => setError(err.message))
  }, [])

  return (
    <HostFrame onLogout={onLogout} account={account} title="Обзор">
      {error && <p className="form-error">{error}</p>}
      {stats === null && !error && <p className="muted">Загрузка…</p>}
      {stats && (
        <section className="dashboard">
          <div className="stat-grid">
            <article className="stat-card"><span>Квизов</span><strong>{stats.quizzes}</strong></article>
            <article className="stat-card"><span>Запусков</span><strong>{stats.runs}</strong></article>
            <article className="stat-card"><span>Участников</span><strong>{stats.participants}</strong></article>
            <article className="stat-card"><span>Средний балл</span><strong>{stats.averageScore ?? '—'}</strong></article>
          </div>
          {stats.runs === 0 ? (
            <p className="muted">Запустите квиз, и здесь появится статистика по играм.</p>
          ) : (
            <BarChart
              caption="Запуски по квизам"
              items={stats.byQuiz.filter((quiz) => quiz.runs > 0).map((quiz) => ({
                key: quiz.quizId || quiz.title,
                label: quiz.title,
                value: quiz.runs,
              }))}
            />
          )}
        </section>
      )}
    </HostFrame>
  )
}
