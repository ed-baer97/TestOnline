import { NavLink } from 'react-router-dom'
import { Brand } from '../Brand.jsx'
import { useI18n } from '../i18n.jsx'
import { Crumbs } from '../kit.jsx'
import { EnvControls } from '../topbar.jsx'

export function HostFrame({ onLogout, account, crumbs, title, subtitle, extra, children }) {
  const { t } = useI18n()
  return (
    <main className="sheet">
      <header className="topbar">
        <div className="topbar-brand">
          <Brand to="/host" />
          {account && (
            <div className="account-meta">
              <strong>{account}</strong>
              <span className="muted">{t('Ведущий')}</span>
            </div>
          )}
        </div>
        <div className="top-actions">
          <NavLink className="primary" to="/host/quiz/new">+ {t('Новый квиз')}</NavLink>
          <EnvControls />
          <button className="ghost" type="button" onClick={onLogout}>{t('Выйти')}</button>
        </div>
      </header>
      <nav className="host-tabs" aria-label={t('Разделы кабинета')}>
        <NavLink to="/host" end>{t('Обзор')}</NavLink>
        <NavLink to="/host/quizzes">{t('Квизы')}</NavLink>
        <NavLink to="/host/history">{t('История')}</NavLink>
      </nav>
      {(crumbs || title || extra) && (
        <div className="stats-head">
          <Crumbs items={crumbs} />
          {(title || extra) && (
            <div className="section-head">
              <div>
                {title && <h1>{t(title)}</h1>}
                {subtitle && <p className="muted">{subtitle}</p>}
              </div>
              {extra}
            </div>
          )}
        </div>
      )}
      {children}
    </main>
  )
}

