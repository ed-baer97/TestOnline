import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { api } from './api.js'
import Dashboard from './pages/Dashboard.jsx'
import Editor from './pages/Editor.jsx'
import History from './pages/History.jsx'
import Home from './pages/Home.jsx'
import HostRoom from './pages/HostRoom.jsx'
import Login from './pages/Login.jsx'
import Play from './pages/Play.jsx'
import Quizzes from './pages/Quizzes.jsx'
import Stats from './pages/Stats.jsx'
import { ThemeToggle } from './theme.jsx'

function RequireAuth({ children }) {
  const [ok, setOk] = useState(null)

  useEffect(() => {
    api.me().then((data) => setOk(data.ok)).catch(() => setOk(false))
  }, [])

  if (ok === null) return <p className="center muted">Загрузка…</p>
  if (!ok) return <Navigate to="/host/login" replace />
  return children
}

export default function App() {
  const navigate = useNavigate()

  async function logout() {
    await api.logout()
    navigate('/host/login')
  }

  return (
    <>
    <ThemeToggle />
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/host/login" element={<Login />} />
      <Route path="/host/register" element={<Login />} />
      <Route path="/host" element={<RequireAuth><Dashboard onLogout={logout} /></RequireAuth>} />
      <Route path="/host/quizzes" element={<RequireAuth><Quizzes onLogout={logout} /></RequireAuth>} />
      <Route path="/host/history" element={<RequireAuth><History onLogout={logout} /></RequireAuth>} />
      <Route path="/host/quiz/:id/stats/:resultId/:player" element={<RequireAuth><Stats onLogout={logout} /></RequireAuth>} />
      <Route path="/host/quiz/:id/stats/:resultId" element={<RequireAuth><Stats onLogout={logout} /></RequireAuth>} />
      <Route path="/host/quiz/:id/stats" element={<RequireAuth><Stats onLogout={logout} /></RequireAuth>} />
      <Route path="/host/quiz/:id" element={<RequireAuth><Editor onLogout={logout} /></RequireAuth>} />
      <Route path="/host/room/:code" element={<HostRoom />} />
      <Route path="/play/:code" element={<Play />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}
