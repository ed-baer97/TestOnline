import { Brand } from '../Brand.jsx'
import { TopbarSlot, TopbarSlots } from './topbar.jsx'

export function LearnFrame({ onLogout, children }) {
  return (
    <TopbarSlots>
      <main className="sheet admin-sheet">
        <header className="topbar">
          <Brand to="/learn" />
          <div className="top-actions">
            <TopbarSlot />
            <button className="ghost" type="button" onClick={onLogout}>Выйти</button>
          </div>
        </header>
        {children}
      </main>
    </TopbarSlots>
  )
}
