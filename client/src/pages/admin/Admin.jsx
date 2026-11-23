import { Navigate, Route, Routes } from 'react-router-dom'
import { useAdminProfile, useDashboard } from '../../state/admin/overview.js'
import { AdminFrame } from '../../components/layout/AdminFrame.jsx'
import { Classes, Learners } from './OrgPanels.jsx'
import { Organizations, OrgStaff } from './RegionalPanels.jsx'
import { LessonEditor, MaterialCatalog, MaterialList, MaterialQuizEditor, MaterialQuizzes } from './Materials.jsx'
import { QuizLaunch } from './QuizLaunch.jsx'
import { Regions, RegionalStaff } from './SuperPanels.jsx'
import { DashboardView } from '../../components/admin/ui.jsx'
import LessonView from '../lessons/LessonView.jsx'
import Stats from '../host/Stats.jsx'
import { PlatformStats } from './StatsPanel.jsx'
import { useI18n } from '../../state/i18n.jsx'

function tabsFor(role, t) {
  const tab = (to, label, end = false) => ({ to, label: t(label), end })
  if (role === 'super') {
    return [
      tab('/admin', 'Обзор', true),
      tab('/admin/stats', 'Статистика'),
      tab('/admin/materials', 'Материалы'),
      tab('/admin/quizzes', 'Квизы'),
      tab('/admin/regions', 'Регионы'),
      tab('/admin/staff', 'Админы'),
      tab('/admin/learners', 'Тестируемые'),
    ]
  }
  if (role === 'regional') {
    return [
      tab('/admin', 'Обзор', true),
      tab('/admin/stats', 'Статистика'),
      tab('/admin/organizations', 'Организации'),
      tab('/admin/staff', 'Админы'),
      tab('/admin/quizzes', 'Квизы'),
    ]
  }
  return [
    tab('/admin', 'Обзор', true),
    tab('/admin/stats', 'Статистика'),
    tab('/admin/materials', 'Материалы'),
    tab('/admin/classes', 'Классы'),
    tab('/admin/learners', 'Тестируемые'),
    tab('/admin/quizzes', 'Квизы'),
  ]
}

function Overview() {
  const { t } = useI18n()
  const { stats, error } = useDashboard()

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
  const { me, error } = useAdminProfile()

  if (error) return <p className="center form-error">{t(error)}</p>
  if (!me) return <p className="center muted">{t('Загрузка…')}</p>

  return (
    <AdminFrame me={me} onLogout={onLogout} tabs={tabsFor(me.role, t)}>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="stats/*" element={<PlatformStats me={me} />} />
        {me.role === 'super' && (
          <>
            <Route path="materials" element={<MaterialList />} />
            <Route path="materials/new" element={<LessonEditor />} />
            <Route path="materials/:id/play" element={<LessonView backTo="/admin/materials" preview />} />
            <Route path="materials/:id" element={<LessonEditor />} />
            <Route path="quizzes" element={<MaterialQuizzes />} />
            <Route path="quizzes/new" element={<MaterialQuizEditor />} />
            <Route path="quizzes/:id/stats/:resultId/:player" element={<Stats onLogout={onLogout} base="/admin/quizzes" listTo="/admin/quizzes" embedded />} />
            <Route path="quizzes/:id/stats/:resultId" element={<Stats onLogout={onLogout} base="/admin/quizzes" listTo="/admin/quizzes" embedded />} />
            <Route path="quizzes/:id/stats" element={<Stats onLogout={onLogout} base="/admin/quizzes" listTo="/admin/quizzes" embedded />} />
            <Route path="quizzes/:id" element={<MaterialQuizEditor />} />
            <Route path="regions" element={<Regions />} />
            <Route path="staff" element={<RegionalStaff />} />
            <Route path="learners" element={<Learners isSuper />} />
          </>
        )}
        {me.role === 'regional' && (
          <>
            <Route path="organizations" element={<Organizations me={me} />} />
            <Route path="staff" element={<OrgStaff />} />
            <Route path="quizzes" element={<QuizLaunch />} />
          </>
        )}
        {me.role === 'org' && (
          <>
            <Route path="materials" element={<MaterialCatalog />} />
            <Route path="materials/:id/play" element={<LessonView backTo="/admin/materials" preview />} />
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
