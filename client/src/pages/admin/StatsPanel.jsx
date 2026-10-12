import { useMemo } from 'react'
import { NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { api } from '../../api.js'
import { BANDS } from '../../bands.js'
import { BarChart } from '../../charts.jsx'
import { formatNumber } from '../../format.js'
import { pick, useI18n } from '../../i18n.jsx'
import { Empty, KpiGrid, Rate, Segments, StatsSkeleton } from '../../kit.jsx'
import { DataTable } from '../../table.jsx'
import { useResource } from '../../useResource.js'
import { OrgStatsView } from './OrgStats.jsx'
import { MistakeTable, PeopleTable, StatsHeader, nameColumn, rateColumn } from './statsParts.jsx'

const REGION_PARTS = ['districts', 'organizations', 'lessons', 'quizzes']

export function PlatformStats({ me }) {
  if (me.role === 'org') return <OrgStatsView organizationId="" base="/admin/stats" />
  return (
    <Routes>
      {me.role === 'super' && <Route index element={<RegionIndexPage />} />}
      {me.role === 'super' && <Route path="region/:regionId/*" element={<RegionPage />} />}
      {me.role === 'regional' && <Route path="*" element={<RegionPage />} />}
      <Route path="*" element={<Navigate to="/admin/stats" replace />} />
    </Routes>
  )
}

function percentItems(rows, lang, label = (row) => pick(lang, row.name, row.nameKk)) {
  return rows.map((row) => ({
    key: row.id,
    label: label(row),
    value: row.rate,
    text: row.rate == null ? '—' : `${row.rate}%`,
    empty: row.rate == null,
    answered: row.answered,
  }))
}

// ---------- Платформа: список областей (суперглавный) ----------

function RegionIndexPage() {
  const { lang, t } = useI18n()
  const { data: stats, error, loading } = useResource('platform-stats:', () => api.platformStats())
  return (
    <section className="stack stats-page">
      <StatsHeader title={t('Статистика')} subtitle={t('Вся платформа')} />
      {error && <p className="form-error">{t(error)}</p>}
      {loading && !stats && <StatsSkeleton />}
      {stats && !stats.regions.length && <Empty text="Нет регионов" hint="Создайте область в разделе «Регионы»." />}
      {stats && stats.regions.length > 0 && (
        <>
          <KpiGrid items={[
            { label: 'Областей', value: stats.totals.regions },
            { label: 'Организаций', value: stats.totals.organizations },
            { label: 'Тестируемых', value: stats.totals.learners, hint: 'проходили тест: {count}', vars: { count: formatNumber(stats.totals.activeLearners) } },
            { label: 'Попыток', value: stats.totals.attempts, hint: 'тесты уроков' },
            { label: 'Доля верных', node: <Rate correct={stats.totals.correct} answered={stats.totals.answered} />, hint: 'тесты уроков' },
          ]} />
          <div className="chart-grid">
            <BarChart caption={t('Доля верных по областям')} order="value" percent items={percentItems(stats.regions, lang)} />
            <BarChart
              caption={t('Тестируемые по областям')}
              order="value"
              items={stats.regions.map((item) => ({ key: item.id, label: pick(lang, item.name, item.nameKk), value: item.learners, hint: t('Проходили тест: {count}', { count: formatNumber(item.activeLearners) }) }))}
            />
          </div>
          <DataTable
            caption="Области"
            columns={[
              {
                key: 'name',
                label: 'Область',
                value: (row) => pick(lang, row.name, row.nameKk),
                render: (row) => <NavLink to={`/admin/stats/region/${row.id}`}>{pick(lang, row.name, row.nameKk)}</NavLink>,
              },
              { key: 'districts', label: 'Районов', num: true },
              { key: 'organizations', label: 'Организаций', num: true },
              { key: 'learners', label: 'Тестируемых', num: true },
              { key: 'activeLearners', label: 'Проходили тест', num: true },
              { key: 'attempts', label: 'Попыток', num: true },
              rateColumn(),
            ]}
            rows={stats.regions}
            defaultSort={{ key: 'learners', dir: 'desc' }}
            search={stats.regions.length > 8 ? (row) => `${row.name} ${row.nameKk}` : undefined}
            exportName="regions"
            empty="Нет регионов"
          />
          <p className="muted note">{t('Доля верных ответов считается по отвеченным вопросам. Меньше {min} ответов — оценка ненадёжна и показана серым.', { min: 30 })}</p>
        </>
      )}
    </section>
  )
}

// ---------- Область: районы, организации, уроки, квизы ----------

function RegionPage() {
  const { regionId = '' } = useParams()
  const base = regionId ? `/admin/stats/region/${regionId}` : '/admin/stats'
  const { data, error, loading } = useResource(`platform-stats:${regionId}`, () => api.platformStats(regionId || undefined))
  const crumbs = regionId ? [{ to: '/admin/stats', label: 'Статистика' }] : []
  const shared = { stats: data, error, loading, base, regionId }
  return (
    <Routes>
      <Route index element={<RegionBody {...shared} part="" crumbs={crumbs} />} />
      <Route
        path="organizations/:orgId/*"
        element={<OrgDrill base={base} crumbs={crumbs} stats={data} />}
      />
      <Route path=":part" element={<RegionPart {...shared} crumbs={crumbs} />} />
    </Routes>
  )
}

function OrgDrill({ base, crumbs, stats }) {
  const { lang, t } = useI18n()
  const title = stats ? pick(lang, stats.title, stats.titleKk) : t('Область')
  return (
    <OrgStatsView
      base={`${base}/organizations/:orgId`}
      crumbs={[...crumbs, { to: base, label: title }, { to: `${base}/organizations`, label: t('Организации') }]}
    />
  )
}

function RegionPart(props) {
  const { part } = useParams()
  if (!REGION_PARTS.includes(part)) return <Navigate to={props.base} replace />
  return <RegionBody {...props} part={part} />
}

function RegionBody({ part, stats, error, loading, base, crumbs }) {
  const { lang, t } = useI18n()
  const hasDistricts = Boolean(stats?.districts?.length)
  const current = part || (hasDistricts ? 'districts' : 'organizations')
  const title = stats ? pick(lang, stats.title, stats.titleKk) : t('Статистика')
  return (
    <section className="stack stats-page">
      <StatsHeader crumbs={[...crumbs, { label: title }]} title={title} subtitle={stats ? t('Статистика области') : undefined} />
      {error && <p className="form-error">{t(error)}</p>}
      {loading && !stats && <StatsSkeleton />}
      {stats && (
        <>
          <RegionKpis stats={stats} />
          <Segments
            label="Разделы статистики"
            items={[
              hasDistricts ? { to: base, label: 'Районы', count: stats.districts.length } : null,
              { to: hasDistricts ? `${base}/organizations` : base, label: 'Организации', count: stats.organizations.length },
              { to: `${base}/lessons`, label: 'Уроки', count: stats.lessons.length },
              { to: `${base}/quizzes`, label: 'Квизы', count: stats.cards.find((card) => card.label === 'Квизов')?.value ?? 0 },
            ].filter(Boolean)}
          />
          {current === 'districts' && <DistrictStats stats={stats} />}
          {current === 'organizations' && <OrganizationStats stats={stats} base={base} />}
          {current === 'lessons' && <LessonStats stats={stats} />}
          {current === 'quizzes' && <QuizStats stats={stats} />}
          <p className="muted note">{t('Доля верных ответов считается по отвеченным вопросам. Меньше {min} ответов — оценка ненадёжна и показана серым.', { min: 30 })}</p>
        </>
      )}
    </section>
  )
}

function RegionKpis({ stats }) {
  const totals = stats.totals
  return (
    <KpiGrid items={[
      { label: 'Тестируемых', value: totals.learners, hint: 'проходили тест: {count}', vars: { count: formatNumber(totals.activeLearners) } },
      { label: 'Организаций', value: stats.organizations.length, hint: 'активных: {count}', vars: { count: formatNumber(totals.activeOrganizations) } },
      { label: 'Попыток', value: totals.attempts, hint: 'тесты уроков' },
      { label: 'Доля верных', node: <Rate correct={totals.correct} answered={totals.answered} />, hint: 'тесты уроков' },
      { label: 'Запусков квизов', value: totals.quizRuns, hint: 'участников: {count}', vars: { count: formatNumber(totals.quizParticipants) } },
      { label: 'Доля верных в квизах', node: <Rate correct={totals.quizCorrect} answered={totals.quizAnswered} />, hint: 'приватные запуски' },
    ]} />
  )
}

function DistrictStats({ stats }) {
  const { lang, t } = useI18n()
  const rows = stats.districts
  if (!rows.length) return <Empty text="Нет районов" />
  return (
    <>
      <div className="chart-grid">
        <BarChart caption={t('Доля верных по районам')} order="value" percent items={percentItems(rows, lang)} />
        <BarChart
          caption={t('Тестируемые по районам')}
          order="value"
          items={rows.map((item) => ({ key: item.id, label: pick(lang, item.name, item.nameKk), value: item.learners }))}
        />
      </div>
      <DataTable
        caption="Районы"
        columns={[
          nameColumn('name', 'Район', lang),
          { key: 'organizations', label: 'Организаций', num: true },
          { key: 'learners', label: 'Тестируемых', num: true },
          rateColumn('Доля верных в уроках'),
        ]}
        rows={rows}
        defaultSort={{ key: 'learners', dir: 'desc' }}
        exportName="districts"
        empty="Нет районов"
      />
    </>
  )
}

function OrganizationStats({ stats, base }) {
  const { lang, t } = useI18n()
  const rows = stats.organizations
  if (!rows.length) return <Empty text="Нет организаций" hint="Организации создаёт администратор области." />
  const hasDistricts = stats.districts.length > 0
  return (
    <>
      <div className="chart-grid">
        <BarChart caption={t('Доля верных по организациям')} order="value" percent items={percentItems(rows, lang)} />
        <BarChart
          caption={t('Тестируемые по организациям')}
          order="value"
          items={rows.map((item) => ({ key: item.id, label: pick(lang, item.name, item.nameKk), value: item.learners, hint: t('Проходили тест: {count}', { count: formatNumber(item.activeLearners) }) }))}
        />
      </div>
      <DataTable
        caption="Организации"
        columns={[
          {
            key: 'name',
            label: 'Организация',
            value: (row) => pick(lang, row.name, row.nameKk),
            render: (row) => <NavLink to={`${base}/organizations/${row.id}`}>{pick(lang, row.name, row.nameKk)}</NavLink>,
          },
          { key: 'district', label: 'Район', hidden: !hasDistricts, value: (row) => (row.district ? pick(lang, row.district, row.districtKk) : null) },
          { key: 'classes', label: 'Классов', num: true },
          { key: 'learners', label: 'Тестируемых', num: true },
          { key: 'activeLearners', label: 'Проходили тест', num: true },
          { key: 'attempts', label: 'Попыток', num: true },
          rateColumn(),
        ]}
        rows={rows}
        defaultSort={{ key: 'learners', dir: 'desc' }}
        search={(row) => `${row.name} ${row.nameKk} ${row.district || ''} ${row.districtKk || ''}`}
        searchPlaceholder="Название организации"
        exportName="organizations"
        empty="Нет организаций"
      />
    </>
  )
}

// Районы → организации → участники для одного урока или квиза.
function PlacesTable({ places, kind, hasDistricts }) {
  const { lang } = useI18n()
  const countColumns = kind === 'quiz'
    ? [{ key: 'runs', label: 'Запусков', num: true }, { key: 'participants', label: 'Участников', num: true }]
    : [{ key: 'attempts', label: 'Попыток', num: true }, { key: 'learners', label: 'Прошли', num: true }]
  const orgTable = (orgs) => (
    <DataTable
      plain
      compact
      columns={[nameColumn('name', 'Организация', lang), ...countColumns, rateColumn()]}
      rows={orgs}
      rowKey="key"
      defaultSort={{ key: kind === 'quiz' ? 'participants' : 'attempts', dir: 'desc' }}
      search={orgs.length > 10 ? (row) => `${row.name} ${row.nameKk}` : undefined}
      pageSize={30}
      expand={(row) => <PeopleTable people={row.people} kind={kind} />}
      empty="Нет организаций"
    />
  )
  const list = places || []
  const onlyLoose = !hasDistricts || (list.length === 1 && list[0].key === 'none')
  if (onlyLoose) return orgTable(list.flatMap((node) => node.groups || []))
  return (
    <DataTable
      plain
      compact
      columns={[nameColumn('name', 'Район', lang), ...countColumns, rateColumn()]}
      rows={list}
      rowKey="key"
      defaultSort={{ key: kind === 'quiz' ? 'participants' : 'attempts', dir: 'desc' }}
      expand={(row) => orgTable(row.groups || [])}
      empty="Нет районов"
    />
  )
}

function lessonNodeOf(stats, lessonId) {
  for (const band of stats.lessonBands || []) {
    const node = band.groups?.find((item) => item.key === lessonId)
    if (node) return node
  }
  return null
}

function LessonStats({ stats }) {
  const { lang, t } = useI18n()
  const rows = stats.lessons
  const mistakes = (stats.mistakes || []).filter((item) => item.kind === 'Урок')
  const hasDistricts = stats.districts.length > 0
  const byBand = useMemo(() => BANDS.map((band) => {
    const node = (stats.lessonBands || []).find((item) => item.key === band.id)
    return { key: band.id, label: t(band.label), value: node?.rate ?? (node?.answered ? Math.round((node.correct / node.answered) * 100) : null), answered: node?.answered || 0, attempts: node?.attempts || 0 }
  }), [stats.lessonBands, t])
  if (!rows.length) return <Empty text="Нет уроков" hint="Уроки создаёт суперглавный в разделе «Материалы»." />
  return (
    <>
      <div className="chart-grid">
        <BarChart
          caption={t('Доля верных по урокам')}
          order="value"
          percent
          items={percentItems(rows, lang, (row) => pick(lang, row.title, row.titleKk))}
        />
        <BarChart
          caption={t('Доля верных по группам')}
          percent
          items={byBand.map((item) => ({ key: item.key, label: item.label, value: item.value, text: item.value == null ? '—' : `${item.value}%`, empty: item.value == null, answered: item.answered, hint: t('Попыток: {count}', { count: formatNumber(item.attempts) }) }))}
        />
      </div>
      <DataTable
        caption="Уроки"
        columns={[
          { key: 'title', label: 'Урок', value: (row) => pick(lang, row.title, row.titleKk), render: (row) => <span className="cell-name">{pick(lang, row.title, row.titleKk)}</span> },
          { key: 'groups', label: 'Группы', value: (row) => row.groups.map((label) => t(label)).join(', ') },
          { key: 'format', label: 'Формат' },
          { key: 'attempts', label: 'Попыток', num: true },
          { key: 'learners', label: 'Прошли', num: true },
          rateColumn(),
        ]}
        rows={rows}
        defaultSort={{ key: 'attempts', dir: 'desc' }}
        search={rows.length > 10 ? (row) => `${row.title} ${row.titleKk}` : undefined}
        exportName="lessons"
        expand={(row) => {
          const node = lessonNodeOf(stats, row.id)
          return node ? <PlacesTable places={node.groups} kind="lesson" hasDistricts={hasDistricts} /> : <p className="muted">{t('Нет попыток')}</p>
        }}
        empty="Нет уроков"
      />
      <MistakeTable items={mistakes} />
    </>
  )
}

function flattenQuizzes(stats) {
  const byQuiz = new Map()
  for (const band of stats.quizBands || []) {
    if (band.key === 'public') continue
    for (const node of band.groups || []) {
      let row = byQuiz.get(node.key)
      if (!row) {
        row = { id: node.key, title: node.name, runs: 0, participants: 0, correct: 0, answered: 0, bands: [] }
        byQuiz.set(node.key, row)
      }
      row.runs += node.runs || 0
      row.participants += node.participants || 0
      row.correct += node.correct || 0
      row.answered += node.answered || 0
      row.bands.push({ key: band.key, name: band.name, node })
    }
  }
  return [...byQuiz.values()].map((row) => ({ ...row, rate: row.answered ? Math.round((row.correct / row.answered) * 100) : null }))
}

function QuizStats({ stats }) {
  const { t } = useI18n()
  const hasDistricts = stats.districts.length > 0
  const privateRows = useMemo(() => flattenQuizzes(stats), [stats])
  const publicBand = (stats.quizBands || []).find((band) => band.key === 'public')
  const publicRows = (stats.publicQuizzes || []).filter((item) => item.runs > 0)
  const mistakes = (stats.mistakes || []).filter((item) => item.kind !== 'Урок')
  if (!privateRows.length && !publicRows.length) return <Empty text="Нет запусков квизов" hint="Запустите учебный квиз классу — результаты появятся здесь." />
  return (
    <>
      {privateRows.length > 0 && (
        <div className="chart-grid">
          <BarChart
            caption={t('Доля верных по квизам')}
            order="value"
            percent
            items={privateRows.map((row) => ({ key: row.id, label: row.title, value: row.rate, text: row.rate == null ? '—' : `${row.rate}%`, empty: row.rate == null, answered: row.answered }))}
          />
          <BarChart
            caption={t('Участники по квизам')}
            order="value"
            items={privateRows.map((row) => ({ key: row.id, label: row.title, value: row.participants, hint: t('Запусков: {count}', { count: formatNumber(row.runs) }) }))}
          />
        </div>
      )}
      <DataTable
        caption="Приватные запуски для классов"
        columns={[
          { key: 'title', label: 'Квиз', render: (row) => <span className="cell-name">{row.title}</span> },
          { key: 'bands', label: 'Группы', value: (row) => row.bands.map((item) => t(item.name)).join(', ') },
          { key: 'runs', label: 'Запусков', num: true },
          { key: 'participants', label: 'Участников', num: true },
          rateColumn(),
        ]}
        rows={privateRows}
        defaultSort={{ key: 'participants', dir: 'desc' }}
        exportName="quizzes-private"
        expand={(row) => <QuizBands row={row} hasDistricts={hasDistricts} />}
        empty="Приватных запусков пока не было."
      />
      <DataTable
        caption="Публичные запуски"
        columns={[
          { key: 'title', label: 'Квиз', render: (row) => <span className="cell-name">{row.title}</span> },
          { key: 'questionCount', label: 'Вопросов', num: true },
          { key: 'runs', label: 'Запусков', num: true },
          { key: 'participants', label: 'Участников', num: true },
          rateColumn(),
        ]}
        rows={publicRows}
        defaultSort={{ key: 'participants', dir: 'desc' }}
        exportName="quizzes-public"
        expand={(row) => <PeopleTable people={publicBand?.groups?.find((node) => node.key === row.id)?.people} kind="quiz" />}
        empty="Публичных запусков пока не было."
      />
      <MistakeTable items={mistakes} showKind />
    </>
  )
}

function QuizBands({ row, hasDistricts }) {
  const { t } = useI18n()
  if (row.bands.length === 1) return <PlacesTable places={row.bands[0].node.groups} kind="quiz" hasDistricts={hasDistricts} />
  return (
    <DataTable
      plain
      compact
      columns={[
        { key: 'name', label: 'Группа', value: (item) => t(item.name) },
        { key: 'runs', label: 'Запусков', num: true, value: (item) => item.node.runs },
        { key: 'participants', label: 'Участников', num: true, value: (item) => item.node.participants },
        { ...rateColumn(), value: (item) => (item.node.answered ? Math.round((item.node.correct / item.node.answered) * 100) : null), render: (item) => <Rate correct={item.node.correct} answered={item.node.answered} /> },
      ]}
      rows={row.bands}
      rowKey="key"
      expand={(item) => <PlacesTable places={item.node.groups} kind="quiz" hasDistricts={hasDistricts} />}
      empty="Нет групп"
    />
  )
}
