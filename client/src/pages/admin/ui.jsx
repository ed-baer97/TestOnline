import { useState } from 'react'
import { BarChart } from '../../charts.jsx'
import { BANDS } from '../../bands.js'
import { pick, useI18n } from '../../i18n.jsx'

export function Notice({ error, notice }) {
  const { t } = useI18n()
  return (
    <>
      {error && <p className="form-error">{t(error)}</p>}
      {notice && <p className="saved">{t(notice)}</p>}
    </>
  )
}

export function GroupChecks({ groups, onChange }) {
  const { t } = useI18n()
  return (
    <div className="checks">
      {BANDS.map((band) => (
        <label className="check" key={band.id}>
          <input
            type="checkbox"
            checked={Boolean(groups[band.id])}
            onChange={(event) => onChange({ ...groups, [band.id]: event.target.checked })}
          />
          {t(band.label)}
        </label>
      ))}
    </div>
  )
}

function showCell(cell, lang, t) {
  if (cell && typeof cell === 'object' && 'ru' in cell) return pick(lang, cell.ru, cell.kk)
  return typeof cell === 'string' ? t(cell) : cell
}

function ChartBlock({ charts }) {
  const { lang, t } = useI18n()
  const visible = charts.filter((item) => item.items.length)
  if (!visible.length) return null
  return (
    <div className="chart-grid">
      {visible.map((item) => (
        <BarChart
          key={item.caption}
          caption={t(item.caption)}
          items={item.items.map((entry) => ({
            ...entry,
            label: entry.labelKk != null ? pick(lang, entry.label, entry.labelKk) : t(entry.label),
          }))}
        />
      ))}
    </div>
  )
}

function MiniTable({ table }) {
  const { lang, t } = useI18n()
  if (!table?.rows?.length) return null
  return (
    <div className="table-wrap">
      <table className="mini-table">
        <thead>
          <tr>{table.columns.map((column) => <th key={column}>{t(column)}</th>)}</tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.key}>
              {row.cells.map((cell, index) => <td key={`${row.key}-${index}`}>{showCell(cell, lang, t)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TableBlock({ table }) {
  const { t } = useI18n()
  if (!table?.rows?.length) return null
  return (
    <figure className="chart">
      <figcaption>{t(table.caption)}</figcaption>
      <MiniTable table={table} />
    </figure>
  )
}

function foldOf(count) {
  if (count <= 2) return 'minmax(0, 1.1fr) minmax(0, 2fr)'
  if (count === 3) return 'minmax(0, 1.4fr) minmax(0, 0.7fr) minmax(0, 0.9fr)'
  if (count === 4) return 'minmax(0, 1.6fr) minmax(0, 0.6fr) minmax(0, 0.8fr) minmax(0, 0.9fr)'
  return 'minmax(0, 1.4fr) repeat(4, minmax(0, 0.7fr))'
}

export function AccordionBlock({ caption, columns, groups }) {
  const { lang, t } = useI18n()
  if (!groups?.length) return null
  return (
    <div className="stats-fold" style={{ '--fold': foldOf(columns.length) }}>
      {caption && <h2>{t(caption)}</h2>}
      <div className="fold-head">
        <span className="fold-labels">
          {columns.map((column) => <span key={column}>{t(column)}</span>)}
        </span>
      </div>
      <div className="accordion">
        {groups.map((group) => (
          <details key={group.key}>
            <summary>
              <span className="fold-row">
                {group.summary.map((cell, index) => <span key={`${group.key}-${index}`}>{showCell(cell, lang, t)}</span>)}
              </span>
            </summary>
            <FoldBody group={group} />
          </details>
        ))}
      </div>
    </div>
  )
}

function FoldBody({ group }) {
  const { t } = useI18n()
  if (group.groups) {
    return group.groups.length
      ? <AccordionBlock columns={group.groupColumns} groups={group.groups} />
      : <p className="muted">{t(group.empty || 'нет классов')}</p>
  }
  if (group.table?.rows?.length) return <MiniTable table={group.table} />
  return <p className="muted">{t(group.empty || 'нет классов')}</p>
}

export function DashboardView({ stats }) {
  const { t } = useI18n()
  const [part, setPart] = useState('')
  if (!stats) return <p className="muted">{t('Загрузка…')}</p>
  const section = stats.sections?.[part]
  return (
    <section className="dashboard">
      {stats.note && <p className="muted">{t(stats.note)}</p>}
      <div className="stat-grid">
        {stats.cards.map((card) => {
          const key = card.section
          if (!key || !stats.sections?.[key]) {
            return (
              <article className="stat-card" key={card.label}>
                <span>{t(card.label)}</span>
                <strong>{card.value}</strong>
              </article>
            )
          }
          return (
            <button
              className={`stat-card ${part === key ? 'active' : ''}`}
              key={card.label}
              type="button"
              onClick={() => setPart((current) => (current === key ? '' : key))}
            >
              <span>{t(card.label)}</span>
              <strong>{card.value}</strong>
            </button>
          )
        })}
      </div>
      {section ? (
        <>
          <ChartBlock charts={section.charts} />
          {section.groups ? (
            <AccordionBlock caption={section.table.caption} columns={section.groupColumns} groups={section.groups} />
          ) : (
            <TableBlock table={section.table} />
          )}
        </>
      ) : (
        <>
          <ChartBlock charts={stats.charts} />
          <TableBlock table={stats.table} />
        </>
      )}
    </section>
  )
}
