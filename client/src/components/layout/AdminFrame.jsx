import { NavLink } from 'react-router-dom'
import { roleLabel } from '../../lib/roles.js'
import { Brand } from '../Brand.jsx'
import { TopbarSlot, TopbarSlots } from './topbar.jsx'

export function AdminFrame({ me, onLogout, tabs, children }) {
  const scope = me.regionName || me.organizationName || 'Вся платформа'
  return (
    <TopbarSlots>
    <main className="sheet admin-sheet">
      <header className="topbar">
        <Brand to="/admin" />
        <div className="top-actions">
          <span className="muted">{roleLabel(me.role)} · {scope}</span>
          <span>{me.displayName}</span>
          <TopbarSlot />
          <button className="ghost" type="button" onClick={onLogout}>Выйти</button>
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
