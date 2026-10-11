import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { BarChart } from '../charts.jsx'
import { useI18n } from '../i18n.jsx'
import { HostFrame } from './HostFrame.jsx'

export default function Dashboard({ onLogout }) {
  const { t } = useI18n()
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
      {error && <p className="form-error">{t(error)}</p>}
      {stats === null && !error && <p className="muted">{t('Загрузка…')}</p>}
      {stats && (
        <section className="dashboard">
          <div className="stat-grid">
            <article className="stat-card"><span>{t('Квизов')}</span><strong>{stats.quizzes}</strong></article>
            <article className="stat-card"><span>{t('Запусков')}</span><strong>{stats.runs}</strong></article>
            <article className="stat-card"><span>{t('Участников')}</span><strong>{stats.participants}</strong></article>
            <article className="stat-card"><span>{t('Средний балл')}</span><strong>{stats.averageScore ?? '—'}</strong></article>
          </div>
          {stats.runs === 0 ? (
            <p className="muted">{t('Запустите квиз, и здесь появится статистика по играм.')}</p>
          ) : (
            <BarChart
              caption={t('Запуски по квизам')}
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
