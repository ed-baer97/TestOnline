import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { api } from '../api.js'
import { useI18n } from '../i18n.jsx'
import { AdminFrame } from './AdminFrame.jsx'
import { Classes, Learners } from './admin/OrgPanels.jsx'
import { Organizations, OrgStaff } from './admin/RegionalPanels.jsx'
import { LessonEditor, MaterialList } from './admin/Materials.jsx'
import { Regions, RegionalStaff } from './admin/SuperPanels.jsx'
import { DashboardView } from './admin/ui.jsx'
import LessonView from './LessonView.jsx'

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
  const { t } = useI18n()
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.dashboard().then(setStats).catch((err) => setError(err.message))
  }, [])

  return (
    <section className="stack">
      <div className="section-head"><h1>{t('Обзор')}</h1></div>
      {error && <p className="form-error">{t(error)}</p>}
      <DashboardView stats={stats} />
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
