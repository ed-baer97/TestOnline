import { useEffect, useState } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { api } from '../api.js'
import { useI18n } from '../i18n.jsx'
import { AdminFrame } from './AdminFrame.jsx'
import { Classes, Learners } from './admin/OrgPanels.jsx'
import { Organizations, OrgStaff } from './admin/RegionalPanels.jsx'
import { LessonEditor, MaterialList, MaterialQuizzes } from './admin/Materials.jsx'
import { QuizLaunch } from './Quizzes.jsx'
import Editor from './Editor.jsx'
import { Regions, RegionalStaff } from './admin/SuperPanels.jsx'
import { PlatformStats } from './admin/StatsPanel.jsx'
import { DashboardView } from './admin/ui.jsx'
import LessonView from './LessonView.jsx'

function tabsFor(role) {
  if (role === 'super') {
    return [
      { to: '/admin', label: 'Обзор', end: true },
      { to: '/admin/stats', label: 'Статистика' },
      { to: '/admin/materials', label: 'Материалы' },
      { to: '/admin/regions', label: 'Регионы' },
      { to: '/admin/staff', label: 'Админы' },
    ]
  }
  if (role === 'regional') {
    return [
      { to: '/admin', label: 'Обзор', end: true },
      { to: '/admin/stats', label: 'Статистика' },
      { to: '/admin/organizations', label: 'Организации' },
      { to: '/admin/staff', label: 'Админы' },
      { to: '/admin/quizzes', label: 'Квизы' },
    ]
  }
  return [
    { to: '/admin', label: 'Обзор', end: true },
    { to: '/admin/stats', label: 'Статистика' },
    { to: '/admin/classes', label: 'Классы' },
    { to: '/admin/learners', label: 'Тестируемые' },
    { to: '/admin/quizzes', label: 'Квизы' },
  ]
}

function Overview({ me }) {
  const { t } = useI18n()
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.dashboard().then(setStats).catch((err) => setError(err.message))
  }, [])

  return (
    <section className="stack">
      <div className="section-head">
        <div>
          <h1>{t('Обзор')}</h1>
          <p className="muted">{t('Состав: кто и где учится. Результаты тестов — в разделе «Статистика».')}</p>
        </div>
        <NavLink className="ghost" to="/admin/stats">{t('Открыть статистику')}</NavLink>
      </div>
      {error && <p className="form-error">{t(error)}</p>}
      <DashboardView stats={stats} sections={me.role !== 'org'} />
    </section>
  )
}

export default function Admin({ onLogout }) {
  const { t } = useI18n()
  const [me, setMe] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.me().then((data) => {
      if (!data.ok) setError('Нужен вход')
      else setMe(data)
    }).catch((err) => setError(err.message))
  }, [])

  if (error) return <p className="center form-error">{t(error)}</p>
  if (!me) return <p className="center muted">{t('Загрузка…')}</p>

  return (
    <AdminFrame me={me} onLogout={onLogout} tabs={tabsFor(me.role)}>
      <Routes>
        <Route index element={<Overview me={me} />} />
        <Route path="stats/*" element={<PlatformStats me={me} />} />
        {me.role === 'super' && (
          <>
            <Route path="materials" element={<MaterialList />} />
            <Route path="materials/quizzes" element={<MaterialQuizzes />} />
            <Route path="materials/quizzes/new" element={<Editor embedded />} />
            <Route path="materials/quizzes/:id" element={<Editor embedded />} />
            <Route path="materials/new" element={<LessonEditor />} />
            <Route path="materials/:id/play" element={<LessonView backTo="/admin/materials" />} />
            <Route path="materials/:id" element={<LessonEditor />} />
            <Route path="regions" element={<Regions />} />
            <Route path="staff" element={<RegionalStaff />} />
          </>
        )}
        {me.role === 'regional' && (
          <>
            <Route path="organizations" element={<Organizations />} />
            <Route path="staff" element={<OrgStaff />} />
            <Route path="quizzes" element={<QuizLaunch />} />
          </>
        )}
        {me.role === 'org' && (
          <>
            <Route path="classes" element={<Classes />} />
            <Route path="learners" element={<Learners />} />
            <Route path="quizzes" element={<QuizLaunch />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </AdminFrame>
  )
}
