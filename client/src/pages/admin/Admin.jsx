import { Navigate, Route, Routes } from 'react-router-dom'
import { useAdminProfile, useDashboard } from '../../state/admin/overview.js'
import { AdminFrame } from '../../components/layout/AdminFrame.jsx'
import { Classes, Learners } from './OrgPanels.jsx'
import { Organizations, OrgStaff } from './RegionalPanels.jsx'
import { LessonEditor, MaterialList } from './Materials.jsx'
import { Regions, RegionalStaff } from './SuperPanels.jsx'
import { DashboardView } from '../../components/admin/ui.jsx'
import LessonView from '../lessons/LessonView.jsx'

function tabsFor(role) {
  if (role === 'super') {
    return [
      { to: '/admin', label: 'Обзор', end: true },
      { to: '/admin/materials', label: 'Материалы' },
      { to: '/admin/regions', label: 'Регионы' },
      { to: '/admin/staff', label: 'Админы' },
    ]
  }
  if (role === 'regional') {
    return [
      { to: '/admin', label: 'Обзор', end: true },
      { to: '/admin/organizations', label: 'Организации' },
      { to: '/admin/staff', label: 'Админы' },
    ]
  }
  return [
    { to: '/admin', label: 'Обзор', end: true },
    { to: '/admin/classes', label: 'Классы' },
    { to: '/admin/learners', label: 'Тестируемые' },
  ]
}

function Overview() {
  const { stats, error } = useDashboard()

  return (
    <section className="stack">
      <div className="section-head"><h1>Обзор</h1></div>
      {error && <p className="form-error">{error}</p>}
      <DashboardView stats={stats} />
    </section>
  )
}

export default function Admin({ onLogout }) {
  const { me, error } = useAdminProfile()

  if (error) return <p className="center form-error">{error}</p>
  if (!me) return <p className="center muted">Загрузка…</p>

  return (
    <AdminFrame me={me} onLogout={onLogout} tabs={tabsFor(me.role)}>
      <Routes>
        <Route index element={<Overview />} />
        {me.role === 'super' && (
          <>
            <Route path="materials" element={<MaterialList />} />
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
          </>
        )}
        {me.role === 'org' && (
          <>
            <Route path="classes" element={<Classes />} />
            <Route path="learners" element={<Learners />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </AdminFrame>
  )
}
