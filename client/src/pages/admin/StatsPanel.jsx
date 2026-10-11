import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { api } from '../../api.js'
import { BarChart } from '../../charts.jsx'
import { pick, useI18n } from '../../i18n.jsx'
import { AccordionBlock } from './ui.jsx'

function DataTable({ caption, columns, rows }) {
  const { t } = useI18n()
  return (
    <figure className="chart">
      <figcaption>{t(caption)}</figcaption>
      <div className="table-wrap">
        <table className="mini-table">
          <thead>
            <tr>{columns.map((column) => <th key={column}>{t(column)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                {row.cells.map((cell, index) => <td key={`${row.key}-${index}`}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

function partOf(pathname) {
  if (pathname.endsWith('/organizations')) return 'organizations'
  if (pathname.endsWith('/lessons') || pathname.endsWith('/materials')) return 'lessons'
  if (pathname.endsWith('/quizzes')) return 'quizzes'
  return 'districts'
}

function regionFrom(pathname) {
  const match = pathname.match(/\/stats\/region\/([^/]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

function cardPath(label, regionId) {
  const base = regionId ? `/admin/stats/region/${regionId}` : '/admin/stats'
  if (label === 'Организаций') return `${base}/organizations`
  if (label === 'Уроков') return `${base}/lessons`
  if (label === 'Квизов') return `${base}/quizzes`
  return base
}

export function PlatformStats() {
  const { lang, t } = useI18n()
  const location = useLocation()
  const regionId = regionFrom(location.pathname)
  const part = partOf(location.pathname)
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setStats(null)
    api.platformStats(regionId).then(setStats).catch((err) => setError(err.message))
  }, [regionId])

  const opened = stats?.scope === 'region' ? regionId || stats.regionId : ''
  return (
    <section className="stack">
      <div className="section-head">
        <div>
          <h1>{opened && stats?.title ? pick(lang, stats.title, stats.titleKk) : t('Статистика')}</h1>
        </div>
        {regionId && <NavLink to="/admin/stats" end>{t('Все области')}</NavLink>}
      </div>
      {error && <p className="form-error">{t(error)}</p>}
      {!stats && !error && <p className="muted">{t('Загрузка…')}</p>}
      {stats?.scope === 'platform' && <RegionIndex stats={stats} />}
      {stats?.scope === 'region' && (
        <>
          <div className="stat-grid">
            {stats.cards.map((card) => (
              <NavLink className="stat-card" key={card.label} to={cardPath(card.label, regionId)} end={card.label === 'Районов'}>
                <span>{t(card.label)}</span>
                <strong>{card.value}</strong>
              </NavLink>
            ))}
          </div>
          {part === 'districts' && <DistrictStats stats={stats} />}
          {part === 'organizations' && <OrganizationStats stats={stats} />}
          {part === 'lessons' && <LessonStats stats={stats} />}
          {part === 'quizzes' && <QuizPage stats={stats} />}
        </>
      )}
    </section>
  )
}

function RegionIndex({ stats }) {
  const { lang, t } = useI18n()
  if (!stats.regions.length) return <p className="muted">{t('Нет регионов')}</p>
  const rateText = (rate) => (rate == null ? '—' : `${rate}%`)
  return (
    <>
      <div className="chart-grid">
        <BarChart
          caption={t('Тестируемые по областям')}
          items={stats.regions.map((item) => ({
            key: item.id,
            label: pick(lang, item.name, item.nameKk),
            value: item.learners,
          }))}
        />
        <BarChart
          caption={t('Верные ответы по областям')}
          items={stats.regions.map((item) => ({
            key: item.id,
            label: pick(lang, item.name, item.nameKk),
            value: item.rate ?? 0,
            text: `${item.rate ?? 0}%`,
          }))}
        />
      </div>
      <DataTable
        caption="Области"
        columns={['Область', 'Районов', 'Организаций', 'Тестируемые', 'Верных ответов']}
        rows={stats.regions.map((item) => ({
          key: item.id,
          cells: [
            <NavLink key={item.id} to={`/admin/stats/region/${item.id}`}>{pick(lang, item.name, item.nameKk)}</NavLink>,
            item.districts,
            item.organizations,
            item.learners,
            rateText(item.rate),
          ],
        }))}
      />
    </>
  )
}

function DistrictStats({ stats }) {
  const { lang, t } = useI18n()
  if (!stats.districts.length) return <p className="muted">{t('Нет районов')}</p>
  return (
    <>
      <div className="chart-grid">
        <BarChart
          caption={t('Тестируемые по районам')}
          items={stats.districts.map((item) => ({
            key: item.id,
            label: pick(lang, item.name, item.nameKk),
            value: item.learners,
          }))}
        />
        <BarChart
          caption={t('Верные ответы по районам')}
          items={stats.districts.map((item) => ({
            key: item.id,
            label: pick(lang, item.name, item.nameKk),
            value: item.rate ?? 0,
            text: `${item.rate ?? 0}%`,
          }))}
        />
      </div>
      <DataTable
        caption="Районы"
        columns={['Область', 'Район', 'Организации', 'Тестируемые', 'Верных ответов']}
        rows={stats.districts.map((item) => ({
          key: item.id,
          cells: [
            pick(lang, item.region, item.regionKk),
            pick(lang, item.name, item.nameKk),
            item.organizations,
            item.learners,
            item.rate == null ? '—' : `${item.rate}%`,
          ],
        }))}
      />
    </>
  )
}

function OrganizationStats({ stats }) {
  const { lang, t } = useI18n()
  if (!stats.organizations.length) return <p className="muted">{t('Нет организаций')}</p>
  return (
    <>
      <div className="chart-grid">
        <BarChart
          caption={t('Тестируемые по организациям')}
          items={stats.organizations.map((item) => ({
            key: item.id,
            label: pick(lang, item.name, item.nameKk),
            value: item.learners,
          }))}
        />
        <BarChart
          caption={t('Верные ответы по организациям')}
          items={stats.organizations.map((item) => ({
            key: item.id,
            label: pick(lang, item.name, item.nameKk),
            value: item.rate ?? 0,
            text: `${item.rate ?? 0}%`,
          }))}
        />
      </div>
      <DataTable
        caption="Организации"
        columns={['Организация', 'Район', 'Область', 'Классы', 'Тестируемые', 'Верных ответов']}
        rows={stats.organizations.map((item) => ({
          key: item.id,
          cells: [
            pick(lang, item.name, item.nameKk),
            item.district ? pick(lang, item.district, item.districtKk) : '—',
            pick(lang, item.region, item.regionKk),
            item.classes,
            item.learners,
            item.rate == null ? '—' : `${item.rate}%`,
          ],
        }))}
      />
    </>
  )
}

function MistakeTable({ items }) {
  const { lang, t } = useI18n()
  if (!items.length) return <p className="muted">{t('Ошибок пока нет.')}</p>
  return (
    <DataTable
      caption="Чаще всего ошибаются"
      columns={['Вопрос', 'Материал', 'Ошибок', 'Верных ответов']}
      rows={items.map((item) => ({
        key: `${item.kind}:${item.source}:${item.text}`,
        cells: [
          pick(lang, item.text, item.textKk),
          `${t(item.kind)} · ${pick(lang, item.source, item.sourceKk)}`,
          item.wrong,
          item.correct,
        ],
      }))}
    />
  )
}

function LessonStats({ stats }) {
  const { t } = useI18n()
  const mistakes = (stats.mistakes || []).filter((item) => item.kind === 'Урок')
  const bands = stats.lessonBands || []
  return (
    <>
      {bands.length > 0 && (
        <>
          <div className="chart-grid">
            <BarChart
              caption={t('Попытки по группам')}
              items={bands.map((band) => ({
                key: band.key,
                label: t(band.summary[0]),
                value: band.summary[2],
              }))}
            />
            <BarChart
              caption={t('Верные ответы по группам')}
              items={bands.map((band) => ({
                key: band.key,
                label: t(band.summary[0]),
                value: band.summary[3],
                text: String(band.summary[3]),
              }))}
            />
          </div>
          <AccordionBlock
            caption="Уроки"
            columns={['Группа', 'Уроки', 'Попытки', 'Верных ответов']}
            groups={bands}
          />
        </>
      )}
      {!bands.length && <p className="muted">{t('Нет уроков')}</p>}
      <MistakeTable items={mistakes} />
    </>
  )
}

function QuizPage({ stats }) {
  const { t } = useI18n()
  const mistakes = (stats.mistakes || []).filter((item) => item.kind === 'Публичный')
  const bands = stats.quizBands || []
  return (
    <>
      {bands.length > 0 && (
        <>
          <div className="chart-grid">
            <BarChart
              caption={t('Запуски по группам')}
              items={bands.map((band) => ({
                key: band.key,
                label: t(band.summary[0]),
                value: band.summary[2],
              }))}
            />
            <BarChart
              caption={t('Верные ответы по группам')}
              items={bands.map((band) => ({
                key: band.key,
                label: t(band.summary[0]),
                value: band.summary[3],
                text: String(band.summary[3]),
              }))}
            />
          </div>
          <AccordionBlock
            caption="Квизы"
            columns={['Группа', 'Квизы', 'Запуски', 'Верных ответов', '%']}
            groups={bands}
          />
        </>
      )}
      {!bands.length && <p className="muted">{t('Нет квизов')}</p>}
      <MistakeTable items={mistakes} />
    </>
  )
}
