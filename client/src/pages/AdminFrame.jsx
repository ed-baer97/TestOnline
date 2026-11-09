import { NavLink } from 'react-router-dom'
import { Brand } from '../Brand.jsx'
import { pick, useI18n } from '../i18n.jsx'
import { roleLabel } from '../roles.js'
import { EnvControls, TopbarSlot, TopbarSlots } from '../topbar.jsx'

export function tabsFor(role) {
  if (role === 'super') {
    return [
      { to: '/admin', label: 'Обзор', end: true },
      { to: '/admin/stats', label: 'Статистика' },
      { to: '/admin/materials', label: 'Материалы' },
      { to: '/admin/regions', label: 'Регионы' },
      { to: '/admin/staff', label: 'Админы' },
    ]
  }
  if (role === 'regional') {
    return [
      { to: '/admin', label: 'Обзор', end: true },
      { to: '/admin/stats', label: 'Статистика' },
      { to: '/admin/organizations', label: 'Организации' },
      { to: '/admin/staff', label: 'Админы' },
      { to: '/admin/quizzes', label: 'Квизы' },
    ]
  }
  return [
    { to: '/admin', label: 'Обзор', end: true },
    { to: '/admin/stats', label: 'Статистика' },
    { to: '/admin/classes', label: 'Классы' },
    { to: '/admin/learners', label: 'Тестируемые' },
    { to: '/admin/quizzes', label: 'Квизы' },
  ]
}

export function AdminFrame({ me, onLogout, tabs, children }) {
  const { lang, t } = useI18n()
  const navTabs = tabs || tabsFor(me?.role)
  const scope = me.regionName
    ? pick(lang, me.regionName, me.regionNameKk)
    : me.organizationName
      ? pick(lang, me.organizationName, me.organizationNameKk)
      : t('Вся платформа')
  return (
    <TopbarSlots>
      <main className="sheet admin-sheet">
        <header className="topbar">
          <div className="topbar-brand">
            <Brand to="/admin" />
            <div className="account-meta">
              <strong>{me.displayName}</strong>
              <span className="muted">{t(roleLabel(me.role))} · {scope}</span>
            </div>
          </div>
          <div className="top-actions">
            <TopbarSlot />
            <EnvControls />
            <button className="ghost" type="button" onClick={onLogout}>{t('Выйти')}</button>
          </div>
        </header>
        <nav className="host-tabs" aria-label={t('Разделы кабинета')}>
          {navTabs.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end={tab.end}>{t(tab.label)}</NavLink>
          ))}
        </nav>
        {children}
      </main>
    </TopbarSlots>
  )
}

