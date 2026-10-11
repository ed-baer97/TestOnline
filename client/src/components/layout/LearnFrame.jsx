import { Link } from 'react-router-dom'
import { TopbarSlot, TopbarSlots } from './topbar.jsx'

export function LearnFrame({ onLogout, children }) {
  return (
    <TopbarSlots>
      <main className="sheet admin-sheet">
        <header className="topbar">
          <Link className="brand" to="/learn">TestOnline</Link>
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
