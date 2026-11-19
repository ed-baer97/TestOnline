import { NavLink } from 'react-router-dom'
import { useI18n } from '../../state/i18n.jsx'
import { Brand } from '../Brand.jsx'
import { EnvControls } from './topbar.jsx'

export function HostFrame({ onLogout, account, title, extra, children }) {
  const { t } = useI18n()
  return (
    <main className="sheet">
      <header className="topbar">
        <Brand to="/host" />
        <div className="top-actions">
          <NavLink className="primary" to="/host/quiz/new">{t('Новый квиз')}</NavLink>
          {account && <span className="muted">{account}</span>}
          <EnvControls />
          <button className="ghost" type="button" onClick={onLogout}>{t('Выйти')}</button>
        </div>
      </header>
      <nav className="host-tabs">
        <NavLink to="/host" end>{t('Обзор')}</NavLink>
        <NavLink to="/host/quizzes">{t('Квизы')}</NavLink>
        <NavLink to="/host/history">{t('История')}</NavLink>
      </nav>
      <div className="section-head">
        <h1>{title}</h1>
        {extra}
      </div>
      {children}
    </main>
  )
}
