import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useI18n } from '../i18n.jsx'
import { Brand } from '../Brand.jsx'
import { homeFor } from '../roles.js'

export default function Login() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (location.state?.loggedOut) return
    api.me().then((data) => {
      if (data.ok) navigate(homeFor(data.role), { replace: true })
    }).catch(() => {})
  }, [navigate, location.state])

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
        <Brand />
        <h1>{t('Вход')}</h1>
        <p className="muted">{t('Логин и пароль выдаёт администратор.')}</p>
        <label>
          {t('Логин')}
          <input
            autoFocus
            autoComplete="username"
            value={login}
            onChange={(event) => setLogin(event.target.value)}
          />
        </label>
        <label>
          {t('Пароль')}
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p className="form-error">{t(error)}</p>}
        <button className="primary" type="submit" disabled={pending}>{t('Войти')}</button>
        <Link className="text-link" to="/">{t('На главную')}</Link>
      </form>
    </main>
  )
}
