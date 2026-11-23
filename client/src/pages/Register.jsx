import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand.jsx'
import { EnvControls } from '../components/layout/topbar.jsx'
import { pick, useI18n } from '../state/i18n.jsx'
import { useRegister } from '../state/session.js'

export default function Register() {
  const { lang, t } = useI18n()
  const navigate = useNavigate()
  const {
    loaded,
    roles,
    regions,
    districts,
    organizations,
    role,
    setRole,
    regionId,
    changeRegion,
    districtId,
    changeDistrict,
    organizationId,
    setOrganizationId,
    firstName,
    setFirstName,
    lastName,
    setLastName,
    email,
    setEmail,
    password,
    setPassword,
    error,
    pending,
    created,
    submit,
    enterCabinet,
  } = useRegister(navigate)
  const [copied, setCopied] = useState(false)

  async function copyLogin() {
    if (!created?.login) return
    try {
      await navigator.clipboard.writeText(created.login)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard API может быть недоступен
    }
  }

  if (created) {
    return (
      <main className="auth">
        <div className="card">
          <div className="auth-top">
            <Brand to="/" />
            <EnvControls />
          </div>
          <h1>{t('Регистрация завершена')}</h1>
          <p className="muted">{t('Сохраните логин — он понадобится для входа в кабинет.')}</p>
          <div className="register-login-box">
            <div>
              <span className="muted">{t('Ваш логин')}</span>
              <strong><code>{created.login}</code></strong>
            </div>
            <button className="ghost" type="button" onClick={copyLogin}>
              {t(copied ? 'Скопировано' : 'Скопировать')}
            </button>
          </div>
          <button className="primary" type="button" onClick={enterCabinet}>
            {t('Перейти в кабинет')}
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="auth">
      <form className="card" onSubmit={submit}>
        <div className="auth-top">
          <Brand to="/" />
          <EnvControls />
        </div>
        <h1>{t('Регистрация')}</h1>
        <p className="muted">{t('Логин создастся автоматически из имени и фамилии.')}</p>
        <label>
          {t('Роль')}
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            {roles.map((item) => (
              <option key={item.id} value={item.id}>{t(item.label)}</option>
            ))}
          </select>
        </label>
        <label>
          {t('Регион')}
          <select value={regionId} onChange={(event) => changeRegion(event.target.value)} disabled={!regions.length}>
            {!regions.length && <option value="">{t('Нет регионов')}</option>}
            {regions.map((item) => (
              <option key={item.id} value={item.id}>{pick(lang, item.name, item.nameKk)}</option>
            ))}
          </select>
        </label>
        {districts.length > 0 && (
          <label>
            {t('Район')}
            <select value={districtId} onChange={(event) => changeDistrict(event.target.value)}>
              <option value="">{t('Все районы')}</option>
              {districts.map((item) => (
                <option key={item.id} value={item.id}>{pick(lang, item.name, item.nameKk)}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          {t('Школа')}
          <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} disabled={!organizations.length}>
            {!organizations.length && <option value="">{t('Нет организаций')}</option>}
            {organizations.map((item) => (
              <option key={item.id} value={item.id}>{pick(lang, item.name, item.nameKk)}</option>
            ))}
          </select>
        </label>
        {loaded && !organizations.length && (
          <p className="muted">{t('Пока нет доступных школ для регистрации. Обратитесь к администратору.')}</p>
        )}
        <label>
          {t('Имя')}
          <input
            autoComplete="given-name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
        </label>
        <label>
          {t('Фамилия')}
          <input
            autoComplete="family-name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
        </label>
        <label>
          {t('Почта')}
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="name@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          {t('Пароль')}
          <input
            type="password"
            autoComplete="new-password"
            placeholder={t('От 6 символов')}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p className="form-error">{t(error)}</p>}
        <button className="primary" type="submit" disabled={pending || !organizationId}>
          {t(pending ? 'Регистрация…' : 'Зарегистрироваться')}
        </button>
        <Link className="text-link" to="/login">{t('Уже есть аккаунт? Войти')}</Link>
        <Link className="text-link" to="/">{t('На главную')}</Link>
      </form>
    </main>
  )
}
