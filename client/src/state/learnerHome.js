import { useEffect, useState } from 'react'
import { api } from '../api/index.js'

export function useLearnerHome() {
  const [me, setMe] = useState(null)
  const [lessons, setLessons] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.me(), api.lessons()])
      .then(([profile, data]) => {
        if (!profile.ok) setError('Нужен вход')
        else {
          setMe(profile)
          setLessons(data.lessons)
        }
      })
      .catch((err) => setError(err.message))
  }, [])

  return { me, lessons, error }
}
