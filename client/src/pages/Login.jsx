import { Link, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand.jsx'
import { useI18n } from '../state/i18n.jsx'
import { useLogin } from '../state/session.js'

export default function Login() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { login, setLogin, password, setPassword, error, pending, submit } = useLogin(navigate)

  return (
    <main className="auth">
      <form className="card" onSubmit={submit}>
        <Brand to="/" />
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
        {error && <p className="form-error">{error}</p>}
        <button className="primary" type="submit" disabled={pending}>{t('Войти')}</button>
        <Link className="text-link" to="/">{t('На главную')}</Link>
      </form>
    </main>
  )
}
