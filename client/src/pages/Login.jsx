import { Link, useNavigate } from 'react-router-dom'
import { useLogin } from '../state/session.js'

export default function Login() {
  const navigate = useNavigate()
  const { login, setLogin, password, setPassword, error, pending, submit } = useLogin(navigate)

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
