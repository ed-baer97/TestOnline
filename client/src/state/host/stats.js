import { useEffect, useState } from 'react'
import { api } from '../../api/index.js'

export function useHostStats() {
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

  return { stats, account, error }
}

export function useQuizStats(id) {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.quizStats(id).then(setStats).catch((err) => setError(err.message))
  }, [id])

  return { stats, error }
}
