import { NavLink } from 'react-router-dom'
import { Brand } from '../Brand.jsx'
import { pick, useI18n } from '../i18n.jsx'
import { roleLabel } from '../roles.js'
import { TopbarSlot, TopbarSlots } from '../topbar.jsx'

export function AdminFrame({ me, onLogout, tabs, children }) {
  const { lang, t } = useI18n()
  const scope = me.regionName
    ? pick(lang, me.regionName, me.regionNameKk)
    : me.organizationName
      ? pick(lang, me.organizationName, me.organizationNameKk)
      : t('Вся платформа')
  return (
    <TopbarSlots>
    <main className="sheet admin-sheet">
      <header className="topbar">
        <Brand to="/admin" />
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
