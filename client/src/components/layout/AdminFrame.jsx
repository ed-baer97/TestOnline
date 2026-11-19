import { NavLink } from 'react-router-dom'
import { roleLabel } from '../../lib/roles.js'
import { useI18n } from '../../state/i18n.jsx'
import { Brand } from '../Brand.jsx'
import { EnvControls, TopbarSlot, TopbarSlots } from './topbar.jsx'

export function AdminFrame({ me, onLogout, tabs, children }) {
  const { t } = useI18n()
  const scope = me.regionName || me.organizationName || t('Вся платформа')
  return (
    <TopbarSlots>
    <main className="sheet admin-sheet">
      <header className="topbar">
        <Brand to="/admin" />
        <div className="top-actions">
          <span className="muted">{t(roleLabel(me.role))} · {scope}</span>
          <span>{me.displayName}</span>
          <TopbarSlot />
          <EnvControls />
          <button className="ghost" type="button" onClick={onLogout}>{t('Выйти')}</button>
        </div>
      </header>
      <nav className="host-tabs">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end}>{tab.label}</NavLink>
        ))}
      </nav>
      {children}
    </main>
    </TopbarSlots>
  )
}
