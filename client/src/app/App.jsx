import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { ThemeToggle } from '../components/ThemeToggle.jsx'
import Admin from '../pages/admin/Admin.jsx'
import Dashboard from '../pages/host/Dashboard.jsx'
import Editor from '../pages/host/Editor.jsx'
import History from '../pages/host/History.jsx'
import Home from '../pages/Home.jsx'
import HostRoom from '../pages/host/HostRoom.jsx'
import LearnerHome, { LearnLesson } from '../pages/learn/LearnerHome.jsx'
import Login from '../pages/Login.jsx'
import Play from '../pages/play/Play.jsx'
import Quizzes from '../pages/host/Quizzes.jsx'
import Stats from '../pages/host/Stats.jsx'
import { signOut } from '../state/session.js'
import { RequireAuth } from './RequireAuth.jsx'

export default function App() {
  const navigate = useNavigate()

  async function logout() {
    await signOut()
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
