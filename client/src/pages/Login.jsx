import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api.js'

export default function Login() {
  const navigate = useNavigate()
  const registerMode = useLocation().pathname.endsWith('/register')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (registerMode && password !== again) {
      setError('Пароли не совпадают')
      return
    }
    setPending(true)
    try {
      if (registerMode) await api.register(login, password)
      else await api.login(login, password)
      navigate('/host')
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
        <h1>{registerMode ? 'Регистрация' : 'Вход ведущего'}</h1>
        <p className="muted">
          {registerMode
            ? 'После регистрации у вас будет свой список квизов. Первый аккаунт забирает квизы, созданные раньше.'
            : 'Войдите логином и паролем, которые указали при регистрации.'}
        </p>
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
            autoComplete={registerMode ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {registerMode && (
          <label>
            Пароль ещё раз
            <input
              type="password"
              autoComplete="new-password"
              value={again}
              onChange={(event) => setAgain(event.target.value)}
            />
          </label>
        )}
        {error && <p className="form-error">{error}</p>}
        <button className="primary" type="submit" disabled={pending}>
          {registerMode ? 'Создать аккаунт' : 'Войти'}
        </button>
        {registerMode
          ? <Link className="text-link" to="/host/login">Уже есть аккаунт? Войти</Link>
          : <Link className="text-link" to="/host/register">Нет аккаунта? Регистрация</Link>}
        <Link className="text-link" to="/">На главную</Link>
      </form>
    </main>
  )
}
