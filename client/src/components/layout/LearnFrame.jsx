import { useI18n } from '../../state/i18n.jsx'
import { Brand } from '../Brand.jsx'
import { EnvControls, TopbarSlot, TopbarSlots } from './topbar.jsx'

export function LearnFrame({ onLogout, children }) {
  const { t } = useI18n()
  return (
    <TopbarSlots>
      <main className="sheet admin-sheet">
        <header className="topbar">
          <Brand to="/learn" />
          <div className="top-actions">
            <TopbarSlot />
            <EnvControls />
            <button className="ghost" type="button" onClick={onLogout}>{t('Выйти')}</button>
          </div>
        </header>
        {children}
      </main>
    </TopbarSlots>
  )
}
