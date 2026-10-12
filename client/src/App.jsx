import { Suspense, lazy, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { api } from './api.js'
import { homeFor } from './roles.js'
import Home from './pages/Home.jsx'
import LearnerHome, { LearnLesson } from './pages/LearnerHome.jsx'
import Login from './pages/Login.jsx'
import Play from './pages/Play.jsx'
import { LanguageToggle, useI18n } from './i18n.jsx'
import { ThemeToggle } from './theme.jsx'

// Кабинеты администраторов и ведущего грузятся отдельными частями:
// экран участника и уроки тестируемого остаются лёгкими.
const Admin = lazy(() => import('./pages/Admin.jsx'))
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'))
const Editor = lazy(() => import('./pages/Editor.jsx'))
const History = lazy(() => import('./pages/History.jsx'))
const HostRoom = lazy(() => import('./pages/HostRoom.jsx'))
const Quizzes = lazy(() => import('./pages/Quizzes.jsx'))
const Stats = lazy(() => import('./pages/Stats.jsx'))

function Loading() {
  const { t } = useI18n()
  return <p className="center muted">{t('Загрузка…')}</p>
}

function RequireAuth({ roles, children }) {
  const [me, setMe] = useState(undefined)

  useEffect(() => {
    api.me().then((data) => setMe(data.ok ? data : null)).catch(() => setMe(null))
  }, [])

  if (me === undefined) return <Loading />
  if (!me) return <Navigate to="/login" replace />
  if (roles && !roles.includes(me.role)) return <Navigate to={homeFor(me.role)} replace />
  return children
}

export default function App() {
  const navigate = useNavigate()

  async function logout() {
    try {
      await api.logout()
    } catch {
      // Даже если запрос не дошёл, форму входа нужно показать.
    }
    navigate('/login', { replace: true, state: { loggedOut: true } })
  }

  return (
    <>
    <div className="corner-controls">
      <LanguageToggle />
      <ThemeToggle />
    </div>
    <Suspense fallback={<Loading />}>
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
      <Route path="/host/quiz/:id/stats/:resultId/:player" element={<RequireAuth roles={['host', 'super']}><Stats onLogout={logout} /></RequireAuth>} />
      <Route path="/host/quiz/:id/stats/:resultId" element={<RequireAuth roles={['host', 'super']}><Stats onLogout={logout} /></RequireAuth>} />
      <Route path="/host/quiz/:id/stats" element={<RequireAuth roles={['host', 'super']}><Stats onLogout={logout} /></RequireAuth>} />
      <Route path="/host/quiz/:id" element={<RequireAuth roles={['host']}><Editor onLogout={logout} /></RequireAuth>} />
      <Route path="/host/room/:code" element={<HostRoom />} />
      <Route path="/play/:code" element={<Play />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
    </>
  )
}
