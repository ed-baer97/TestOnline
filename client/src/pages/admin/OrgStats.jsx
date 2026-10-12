import { useMemo } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { api } from '../../api.js'
import { BarChart } from '../../charts.jsx'
import { MIN_PERSON_SAMPLE, formatDate, formatNumber, rateOf } from '../../format.js'
import { pick, useI18n } from '../../i18n.jsx'
import { Empty, KpiGrid, Rate, Segments, StatsSkeleton } from '../../kit.jsx'
import { DataTable } from '../../table.jsx'
import { useResource } from '../../useResource.js'
import { BANDS } from '../../bands.js'
import { MistakeTable, StatsHeader, rateColumn } from './statsParts.jsx'

const PARTS = ['classes', 'learners', 'lessons', 'quizzes']

// Статистика одной организации. Администратор организации видит свою;
// регион и суперглавный открывают её из списка организаций.
export function OrgStatsView({ organizationId, base, crumbs = [] }) {
  const params = useParams()
  const orgId = organizationId ?? params.orgId ?? ''
  const root = base.replace(':orgId', orgId)
  const { data, error, loading } = useResource(`org-stats:${orgId}`, () => api.orgStats(orgId || undefined))
  return (
    <Routes>
      <Route index element={<OrgStatsBody part="classes" stats={data} error={error} loading={loading} base={root} crumbs={crumbs} />} />
      <Route path=":part" element={<OrgStatsPart stats={data} error={error} loading={loading} base={root} crumbs={crumbs} />} />
      <Route path="*" element={<Navigate to={root} replace />} />
    </Routes>
  )
}

function OrgStatsPart(props) {
  const { part } = useParams()
  if (!PARTS.includes(part)) return <Navigate to={props.base} replace />
  return <OrgStatsBody {...props} part={part} />
}

function OrgStatsBody({ part, stats, error, loading, base, crumbs }) {
  const { lang, t } = useI18n()
  const title = stats ? pick(lang, stats.title, stats.titleKk) : t('Статистика')
  const place = stats ? [pick(lang, stats.region, stats.regionKk), stats.district ? pick(lang, stats.district, stats.districtKk) : ''].filter(Boolean).join(' · ') : ''
  return (
    <section className="stack stats-page">
      <StatsHeader crumbs={[...crumbs, { label: title }]} title={title} subtitle={place || undefined} />
      {error && <p className="form-error">{t(error)}</p>}
      {loading && !stats && <StatsSkeleton />}
      {stats && (
        <>
          <OrgKpis stats={stats} />
          <Segments
            label="Разделы статистики"
            items={[
              { to: base, label: 'Классы', count: stats.classes.length },
              { to: `${base}/learners`, label: 'Тестируемые', count: stats.learners.length },
              { to: `${base}/lessons`, label: 'Уроки', count: stats.lessons.length },
              { to: `${base}/quizzes`, label: 'Квизы', count: stats.quizzes.length },
            ]}
          />
          {part === 'classes' && <ClassesPart stats={stats} />}
          {part === 'learners' && <LearnersPart stats={stats} />}
          {part === 'lessons' && <LessonsPart stats={stats} />}
          {part === 'quizzes' && <QuizzesPart stats={stats} />}
        </>
      )}
    </section>
  )
}

function OrgKpis({ stats }) {
  const totals = stats.totals
  return (
    <KpiGrid items={[
      { label: 'Тестируемых', value: totals.learners, hint: 'проходили тест: {count}', vars: { count: formatNumber(totals.activeLearners) } },
      { label: 'Попыток', value: totals.attempts, hint: 'тесты уроков' },
      { label: 'Доля верных', node: <Rate correct={totals.correct} answered={totals.answered} />, hint: 'тесты уроков' },
      { label: 'Запусков квизов', value: totals.quizRuns, hint: 'участников: {count}', vars: { count: formatNumber(totals.quizParticipants) } },
      { label: 'Доля верных в квизах', node: <Rate correct={totals.quizCorrect} answered={totals.quizAnswered} />, hint: 'приватные запуски' },
    ]} />
  )
}

function bandLabel(bandId, t) {
  const band = BANDS.find((item) => item.id === bandId)
  return band ? t(band.label) : '—'
}

function ClassLearners({ stats, classId }) {
  const rows = stats.learners.filter((person) => person.classId === classId)
  return <LearnerTable rows={rows} plain compact withClass={false} />
}

function ClassesPart({ stats }) {
  const { t } = useI18n()
  if (!stats.classes.length) return <Empty text="Нет классов" hint="Классы создаются в разделе «Классы»." />
  const rows = stats.classes
  return (
    <>
      <div className="chart-grid">
        <BarChart
          caption={t('Доля верных по классам')}
          order="value"
          percent
          items={rows.map((item) => ({ key: item.id, label: item.caption, value: item.rate, text: item.rate == null ? '—' : `${item.rate}%`, empty: item.rate == null, answered: item.answered }))}
        />
        <BarChart
          caption={t('Проходили тест, человек')}
          order="value"
          items={rows.map((item) => ({ key: item.id, label: item.caption, value: item.active, hint: t('Всего в классе: {count}', { count: formatNumber(item.learners) }) }))}
        />
      </div>
      <DataTable
        caption="Классы"
        columns={[
          { key: 'caption', label: 'Класс', render: (row) => <span className="cell-name">{row.caption}</span> },
          { key: 'band', label: 'Группа', value: (row) => bandLabel(row.band, t) },
          { key: 'learners', label: 'Тестируемых', num: true },
          { key: 'active', label: 'Проходили тест', num: true },
          { key: 'attempts', label: 'Попыток', num: true },
          rateColumn(),
        ]}
        rows={rows}
        defaultSort={{ key: 'caption', dir: 'asc' }}
        search={rows.length > 10 ? (row) => row.caption : undefined}
        exportName="classes"
        expand={(row) => <ClassLearners stats={stats} classId={row.id} />}
        empty="Нет классов"
      />
    </>
  )
}

function LearnerTable({ rows, plain = false, compact = false, withClass = true }) {
  const { t } = useI18n()
  return (
    <DataTable
      plain={plain}
      compact={compact}
      caption={plain ? undefined : 'Тестируемые'}
      columns={[
        { key: 'name', label: 'Имя', render: (row) => <span className="cell-name">{row.name}</span> },
        { key: 'login', label: 'Логин', render: (row) => <code className="cell-code">{row.login}</code> },
        { key: 'classCaption', label: 'Класс', hidden: !withClass },
        { key: 'attempts', label: 'Попыток', num: true },
        { key: 'correct', label: 'Верных ответов', num: true },
        rateColumn('Доля верных', MIN_PERSON_SAMPLE),
        {
          key: 'lastAt',
          label: 'Последняя попытка',
          value: (row) => row.lastAt || null,
          render: (row) => (row.lastAt ? formatDate(row.lastAt, true) : <span className="muted">{t('не проходил')}</span>),
          exportValue: (row) => row.lastAt || '',
        },
      ]}
      rows={rows}
      defaultSort={{ key: 'name', dir: 'asc' }}
      search={(row) => `${row.name} ${row.login} ${row.classCaption}`}
      searchPlaceholder="Имя или логин"
      pageSize={plain ? 30 : 50}
      exportName={plain ? undefined : 'learners'}
      empty="нет тестируемых"
    />
  )
}

function distribution(rows, t) {
  const buckets = [
    { key: 'none', label: t('Не проходили'), from: null, value: 0 },
    { key: 'b0', label: '0–24 %', from: 0, to: 24, value: 0 },
    { key: 'b25', label: '25–49 %', from: 25, to: 49, value: 0 },
    { key: 'b50', label: '50–74 %', from: 50, to: 74, value: 0 },
    { key: 'b75', label: '75–100 %', from: 75, to: 100, value: 0 },
  ]
  for (const row of rows) {
    const rate = row.answered ? rateOf(row.correct, row.answered) : null
    if (rate == null) buckets[0].value += 1
    else {
      const bucket = buckets.find((item) => item.from != null && rate >= item.from && rate <= item.to)
      if (bucket) bucket.value += 1
    }
  }
  return buckets
}

function LearnersPart({ stats }) {
  const { t } = useI18n()
  const rows = stats.learners
  const spread = useMemo(() => distribution(rows, t), [rows, t])
  if (!rows.length) return <Empty text="нет тестируемых" hint="Тестируемые добавляются в разделе «Тестируемые», в том числе из Excel." />
  return (
    <>
      <div className="chart-grid">
        <BarChart
          caption={t('Распределение по доле верных, человек')}
          layout="vertical"
          items={spread}
          note={t('Сколько тестируемых попадает в каждый диапазон доли верных ответов.')}
        />
        <BarChart
          caption={t('Проходили тест по классам, человек')}
          order="value"
          items={stats.classes.map((item) => ({ key: item.id, label: item.caption, value: item.active, hint: t('Всего в классе: {count}', { count: formatNumber(item.learners) }) }))}
        />
      </div>
      <LearnerTable rows={rows} />
    </>
  )
}

function LessonsPart({ stats }) {
  const { lang, t } = useI18n()
  const rows = stats.lessons
  const mistakes = (stats.mistakes || []).filter((item) => item.kind === 'Урок')
  if (!rows.length) return <Empty text="Нет уроков" hint="Уроки назначаются группам организации суперглавным." />
  return (
    <>
      <div className="chart-grid">
        <BarChart
          caption={t('Доля верных по урокам')}
          order="value"
          percent
          items={rows.map((item) => ({ key: item.id, label: pick(lang, item.title, item.titleKk), value: item.rate, text: item.rate == null ? '—' : `${item.rate}%`, empty: item.rate == null, answered: item.answered }))}
        />
        <BarChart
          caption={t('Прошли тест, человек')}
          order="value"
          items={rows.map((item) => ({ key: item.id, label: pick(lang, item.title, item.titleKk), value: item.learners }))}
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
        empty="Нет уроков"
      />
      <MistakeTable items={mistakes} />
    </>
  )
}

function QuizzesPart({ stats }) {
  const { t } = useI18n()
  const rows = stats.quizzes
  const mistakes = (stats.mistakes || []).filter((item) => item.kind === 'Квиз')
  if (!rows.length) return <Empty text="Нет квизов" hint="Здесь появятся приватные запуски учебных квизов для классов этой организации." />
  return (
    <>
      <div className="chart-grid">
        <BarChart
          caption={t('Доля верных по квизам')}
          order="value"
          percent
          items={rows.map((item) => ({ key: item.id, label: item.title, value: item.rate, text: item.rate == null ? '—' : `${item.rate}%`, empty: item.rate == null, answered: item.answered }))}
        />
        <BarChart
          caption={t('Участники по квизам')}
          order="value"
          items={rows.map((item) => ({ key: item.id, label: item.title, value: item.participants }))}
        />
      </div>
      <DataTable
        caption="Квизы"
        columns={[
          { key: 'title', label: 'Квиз', render: (row) => <span className="cell-name">{row.title}</span> },
          { key: 'runs', label: 'Запусков', num: true },
          { key: 'participants', label: 'Участников', num: true },
          rateColumn(),
          { key: 'lastAt', label: 'Последний запуск', value: (row) => row.lastAt || null, render: (row) => formatDate(row.lastAt, true), exportValue: (row) => row.lastAt || '' },
        ]}
        rows={rows}
        defaultSort={{ key: 'lastAt', dir: 'desc' }}
        exportName="quizzes"
        empty="Нет квизов"
      />
      <MistakeTable items={mistakes} />
    </>
  )
}
