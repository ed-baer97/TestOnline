import { useEffect, useState } from 'react'
import { api } from '../api/index.js'
import { homeFor } from '../lib/roles.js'

// undefined — профиль ещё грузится, null — вход не выполнен.
export function useSession() {
  const [me, setMe] = useState(undefined)

  useEffect(() => {
    api.me().then((data) => setMe(data.ok ? data : null)).catch(() => setMe(null))
  }, [])

  return me
}

export async function signOut() {
  await api.logout()
}

// Если вход уже выполнен, страница входа сразу уводит на главную страницу роли.
export function useLogin(navigate) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    api.me().then((data) => {
      if (data.ok) navigate(homeFor(data.role), { replace: true })
    }).catch(() => {})
  }, [navigate])

  async function submit(event) {
    event.preventDefault()
    setError('')
    setPending(true)
    try {
      const data = await api.login(login, password)
      navigate(homeFor(data.role))
    } catch (err) {
      setError(err.message)
    } finally {
      setPending(false)
    }
  }

  return { login, setLogin, password, setPassword, error, pending, submit }
}
