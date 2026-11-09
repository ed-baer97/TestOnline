import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { BarChart } from '../charts.jsx'
import { useI18n } from '../i18n.jsx'
import { HostFrame } from './HostFrame.jsx'

export default function Dashboard({ me, onLogout }) {
  const { t } = useI18n()
  const [stats, setStats] = useState(null)
  const [account, setAccount] = useState(me?.login || '')
  const [error, setError] = useState('')

  useEffect(() => {
    const tasks = [api.stats(), me ? Promise.resolve(me) : api.me()]
    Promise.all(tasks)
      .then(([statsData, profile]) => {
        setStats(statsData)
        setAccount(profile?.login || '')
      })
      .catch((err) => setError(err.message))
  }, [me])

  return (
    <HostFrame onLogout={onLogout} account={account} title="Обзор">
      {error && <p className="form-error">{t(error)}</p>}
      {stats === null && !error && <p className="muted">{t('Загрузка…')}</p>}
      {stats && (
        <section className="dashboard">
          <div className="stat-grid">
            <Link className="stat-card" to="/host/quizzes">
              <span>{t('Квизов')}</span>
              <strong>{stats.quizzes}</strong>
              <small className="muted">{t('К списку квизов')} →</small>
            </Link>
            <Link className="stat-card" to="/host/history">
              <span>{t('Запусков')}</span>
              <strong>{stats.runs}</strong>
              <small className="muted">{t('История')} →</small>
            </Link>
            <article className="stat-card"><span>{t('Участников')}</span><strong>{stats.participants}</strong></article>
            <article className="stat-card"><span>{t('Средний балл')}</span><strong>{stats.averageScore ?? '—'}</strong></article>
          </div>
          {stats.runs === 0 ? (
            <p className="muted">{t('Запустите квиз, и здесь появится статистика по играм.')}</p>
          ) : (
            <BarChart
              caption={t('Запуски по квизам')}
              order="value"
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

