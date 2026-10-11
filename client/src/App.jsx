import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { api } from './api.js'
import { homeFor } from './roles.js'
import Admin from './pages/Admin.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Editor from './pages/Editor.jsx'
import History from './pages/History.jsx'
import Home from './pages/Home.jsx'
import HostRoom from './pages/HostRoom.jsx'
import LearnerHome, { LearnLesson } from './pages/LearnerHome.jsx'
import Login from './pages/Login.jsx'
import Play from './pages/Play.jsx'
import Quizzes from './pages/Quizzes.jsx'
import Stats from './pages/Stats.jsx'
import { ThemeToggle } from './theme.jsx'

function RequireAuth({ roles, children }) {
  const [me, setMe] = useState(undefined)

  useEffect(() => {
    api.me().then((data) => setMe(data.ok ? data : null)).catch(() => setMe(null))
  }, [])

  if (me === undefined) return <p className="center muted">Загрузка…</p>
  if (!me) return <Navigate to="/login" replace />
  if (roles && !roles.includes(me.role)) return <Navigate to={homeFor(me.role)} replace />
  return children
}

export default function App() {
  const navigate = useNavigate()

  async function logout() {
    await api.logout()
    navigate('/login')
  }

  return (
    <>
    <ThemeToggle />
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/host/login" element={<Navigate to="/login" replace />} />
      <Route path="/host/register" element={<Navigate to="/login" replace />} />
      <Route path="/admin/*" element={<RequireAuth roles={['super', 'regional', 'org']}><Admin onLogout={logout} /></RequireAuth>} />
      <Route path="/learn" element={<RequireAuth roles={['learner']}><LearnerHome onLogout={logout} /></RequireAuth>} />
      <Route path="/learn/lessons/:id" element={<RequireAuth roles={['learner']}><LearnLesson onLogout={logout} /></RequireAuth>} />
      <Route path="/host" element={<RequireAuth roles={['host']}><Dashboard onLogout={logout} /></RequireAuth>} />
      <Route path="/host/quizzes" element={<RequireAuth roles={['host']}><Quizzes onLogout={logout} /></RequireAuth>} />
      <Route path="/host/history" element={<RequireAuth roles={['host']}><History onLogout={logout} /></RequireAuth>} />
      <Route path="/host/quiz/:id/stats/:resultId/:player" element={<RequireAuth roles={['host']}><Stats onLogout={logout} /></RequireAuth>} />
      <Route path="/host/quiz/:id/stats/:resultId" element={<RequireAuth roles={['host']}><Stats onLogout={logout} /></RequireAuth>} />
      <Route path="/host/quiz/:id/stats" element={<RequireAuth roles={['host']}><Stats onLogout={logout} /></RequireAuth>} />
      <Route path="/host/quiz/:id" element={<RequireAuth roles={['host']}><Editor onLogout={logout} /></RequireAuth>} />
      <Route path="/host/room/:code" element={<HostRoom />} />
      <Route path="/play/:code" element={<Play />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}
