import { useEffect, useState } from 'react'
import { api } from '../api/index.js'
import { homeFor } from '../lib/roles.js'
import { dropResource } from './resource.js'

// undefined — профиль ещё грузится, null — вход не выполнен.
export function useSession() {
  const [me, setMe] = useState(undefined)

  useEffect(() => {
    let alive = true
    api.me()
      .then((data) => { if (alive) setMe(data.ok ? data : null) })
      .catch(() => { if (alive) setMe(null) })
    return () => { alive = false }
  }, [])

  return me
}

export async function signOut() {
  try {
    await api.logout()
  } catch {
    // Выход в UI и очистка кеша должны срабатывать даже при сетевой ошибке.
  } finally {
    dropResource()
  }
}

// Если вход уже выполнен, страница входа сразу уводит на главную страницу роли.
export function useLogin(navigate) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let alive = true
    api.me().then((data) => {
      if (alive && data.ok) navigate(homeFor(data.role), { replace: true })
    }).catch(() => {})
    return () => { alive = false }
  }, [navigate])

  async function submit(event) {
    event.preventDefault()
    setError('')
    setPending(true)
    try {
      const data = await api.login(login, password)
      dropResource()
      navigate(homeFor(data.role))
    } catch (err) {
      setError(err.message)
    } finally {
      setPending(false)
    }
  }

  return { login, setLogin, password, setPassword, error, pending, submit }
}
