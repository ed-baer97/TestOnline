import { NavLink } from 'react-router-dom'
import { useI18n } from '../i18n.jsx'
import { roleLabel } from '../roles.js'
import { TopbarSlot, TopbarSlots } from '../topbar.jsx'

export function AdminFrame({ me, onLogout, tabs, children }) {
  const { t } = useI18n()
  const scope = me.regionName || me.organizationName || t('Вся платформа')
  return (
    <TopbarSlots>
    <main className="sheet admin-sheet">
      <header className="topbar">
        <NavLink className="brand" to="/admin">TestOnline</NavLink>
        <div className="top-actions">
          <span className="muted">{t(roleLabel(me.role))} · {scope}</span>
          <span>{me.displayName}</span>
          <TopbarSlot />
          <button className="ghost" type="button" onClick={onLogout}>{t('Выйти')}</button>
        </div>
      </header>
      <nav className="host-tabs">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end}>{t(tab.label)}</NavLink>
        ))}
      </nav>
      {children}
    </main>
    </TopbarSlots>
  )
}
