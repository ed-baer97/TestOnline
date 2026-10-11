import { NavLink } from 'react-router-dom'

export function HostFrame({ onLogout, account, title, extra, children }) {
  return (
    <main className="sheet">
      <header className="topbar">
        <NavLink className="brand" to="/host">TestOnline</NavLink>
        <div className="top-actions">
          <NavLink className="primary" to="/host/quiz/new">Новый квиз</NavLink>
          {account && <span className="muted">{account}</span>}
          <button className="ghost" type="button" onClick={onLogout}>Выйти</button>
        </div>
      </header>
      <nav className="host-tabs">
        <NavLink to="/host" end>Обзор</NavLink>
        <NavLink to="/host/quizzes">Квизы</NavLink>
        <NavLink to="/host/history">История</NavLink>
      </nav>
      <div className="section-head">
        <h1>{title}</h1>
        {extra}
      </div>
      {children}
    </main>
  )
}
