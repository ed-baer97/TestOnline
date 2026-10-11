import { useEffect, useState } from 'react'
import { api } from '../../api/index.js'

export function useAdminProfile() {
  const [me, setMe] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.me().then((data) => {
      if (!data.ok) setError('Нужен вход')
      else setMe(data)
    }).catch((err) => setError(err.message))
  }, [])

  return { me, error }
}

export function useDashboard() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.dashboard().then(setStats).catch((err) => setError(err.message))
  }, [])

  return { stats, error }
}
