import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/index.js'
import { homeFor } from '../lib/roles.js'

export default function Login() {
  const navigate = useNavigate()
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

  return (
    <main className="auth">
      <form className="card" onSubmit={submit}>
        <p className="brand">TestOnline</p>
        <h1>Вход</h1>
        <p className="muted">Логин и пароль выдаёт администратор.</p>
        <label>
          Логин
          <input
            autoFocus
            autoComplete="username"
            value={login}
            onChange={(event) => setLogin(event.target.value)}
          />
        </label>
        <label>
          Пароль
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary" type="submit" disabled={pending}>Войти</button>
        <Link className="text-link" to="/">На главную</Link>
      </form>
    </main>
  )
}
