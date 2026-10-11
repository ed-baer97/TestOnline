import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export default function Home() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  function submit(event) {
    event.preventDefault()
    const digits = code.replace(/\D/g, '')
    if (digits.length !== 6) {
      setError('Код комнаты — 6 цифр')
      return
    }
    navigate(`/play/${digits}`)
  }

  return (
    <main className="home">
      <section className="home-copy">
        <p className="brand">TestOnline</p>
        <h1>Обучение и тесты для школ и вузов</h1>
        <p className="lead">
          Организации, классы и тестируемые. Войдите логином, который выдал администратор.
        </p>
        <div className="home-actions">
          <Link className="primary" to="/login">Войти</Link>
        </div>
        <form className="join-form" onSubmit={submit}>
          <label>
            Код комнаты
            <input
              inputMode="numeric"
              autoComplete="off"
              maxLength={7}
              placeholder="482 913"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          <button className="primary" type="submit">Войти</button>
        </form>
        {error && <p className="form-error">{error}</p>}
        <p className="muted">Код комнаты — для живого квиза.</p>
      </section>
      <aside className="phone" aria-hidden="true">
        <p>Столица Франции?</p>
        <div>
          <span className="red">Париж</span>
          <span className="blue">Рим</span>
          <span className="yellow">Берлин</span>
          <span className="green">Мадрид</span>
        </div>
      </aside>
    </main>
  )
}
