import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/index.js'
import { formatWhen } from '../../lib/format.js'
import { HostFrame } from '../../components/layout/HostFrame.jsx'

function when(result) {
  return Date.parse(result.startedAt || result.finishedAt) || 0
}

export default function History({ onLogout }) {
  const [stats, setStats] = useState(null)
  const [account, setAccount] = useState('')
  const [error, setError] = useState('')
  const [sort, setSort] = useState('date')
  const [ascending, setAscending] = useState(false)

  useEffect(() => {
    Promise.all([api.stats(), api.me()])
      .then(([statsData, me]) => {
        setStats(statsData)
        setAccount(me.login || '')
      })
      .catch((err) => setError(err.message))
  }, [])

  const games = useMemo(() => {
    const list = [...(stats?.history || [])]
    list.sort((a, b) => {
      if (sort === 'title') {
        const byTitle = a.title.localeCompare(b.title, 'ru')
        if (byTitle !== 0) return ascending ? byTitle : -byTitle
        return when(b) - when(a)
      }
      const byDate = when(a) - when(b)
      return ascending ? byDate : -byDate
    })
    return list
  }, [stats, sort, ascending])

  function choose(next) {
    if (sort === next) setAscending((value) => !value)
    else {
      setSort(next)
      setAscending(next === 'title')
    }
  }

  const dateLabel = sort === 'date' ? (ascending ? 'По дате: старые' : 'По дате: новые') : 'По дате'
  const titleLabel = sort === 'title' ? (ascending ? 'По названию: А–Я' : 'По названию: Я–А') : 'По названию'

  return (
    <HostFrame
      onLogout={onLogout}
      account={account}
      title="История"
      extra={(
        <div className="top-actions">
          <button className={sort === 'date' ? 'primary' : 'ghost'} type="button" onClick={() => choose('date')}>{dateLabel}</button>
          <button className={sort === 'title' ? 'primary' : 'ghost'} type="button" onClick={() => choose('title')}>{titleLabel}</button>
        </div>
      )}
    >
      {error && <p className="form-error">{error}</p>}
      {stats === null && !error && <p className="muted">Загрузка…</p>}
      {stats && games.length === 0 && <p className="muted">Пока нет сыгранных игр.</p>}
      <ul className="session-list">
        {games.map((result) => (
          <li key={result.id}>
            {result.quizId ? (
              <Link to={`/host/quiz/${result.quizId}/stats/${result.id}`}>
                <strong>{result.title}</strong>
                <span>{formatWhen(result.startedAt || result.finishedAt)} · {result.playerCount} участ.</span>
                <span>{result.top ? `1 место: ${result.top.name} (${result.top.score})` : 'Без игроков'}</span>
              </Link>
            ) : (
              <span>
                <strong>{result.title}</strong>
                <span>{formatWhen(result.startedAt || result.finishedAt)} · {result.playerCount} участ.</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </HostFrame>
  )
}
