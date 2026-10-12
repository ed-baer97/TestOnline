import { useState } from 'react'
import { BarChart } from '../../charts.jsx'
import { BANDS } from '../../bands.js'
import { formatNumber } from '../../format.js'
import { pick, useI18n } from '../../i18n.jsx'
import { Skeleton } from '../../kit.jsx'
import { DataTable } from '../../table.jsx'

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
  const visible = (charts || []).filter((item) => item.items.length)
  if (!visible.length) return null
  return (
    <div className="chart-grid">
      {visible.map((item) => (
        <BarChart
          key={item.caption}
          caption={t(item.caption)}
          order="value"
          items={item.items.map((entry) => ({
            ...entry,
            label: entry.labelKk != null ? pick(lang, entry.label, entry.labelKk) : t(entry.label),
          }))}
        />
      ))}
    </div>
  )
}

function sortableCell(cell) {
  if (cell && typeof cell === 'object' && 'ru' in cell) return cell.ru
  if (typeof cell === 'string' && /^\d+%$/.test(cell)) return Number(cell.slice(0, -1))
  if (cell === '—') return null
  return cell
}

function numericColumn(table, index) {
  return table.rows.some((row) => typeof row.cells[index] === 'number' || /^\d+%$/.test(String(row.cells[index] ?? '')))
}

// Таблица из готовых ячеек сервера (состав), но с сортировкой и поиском.
function MiniTable({ table, plain = true }) {
  const { lang, t } = useI18n()
  if (!table?.rows?.length) return null
  const columns = table.columns.map((label, index) => ({
    key: String(index),
    label,
    num: numericColumn(table, index),
    value: (row) => sortableCell(row.cells[index]),
    render: (row) => showCell(row.cells[index], lang, t),
  }))
  return (
    <DataTable
      plain={plain}
      compact={plain}
      caption={plain ? undefined : table.caption}
      columns={columns}
      rows={table.rows}
      rowKey="key"
      search={table.rows.length > 10 ? (row) => row.cells.map((cell) => (cell && typeof cell === 'object' ? `${cell.ru} ${cell.kk || ''}` : String(cell ?? ''))).join(' ') : undefined}
      pageSize={plain ? 30 : 50}
      exportName={plain ? undefined : 'table'}
    />
  )
}

function TableBlock({ table }) {
  if (!table?.rows?.length) return null
  return <MiniTable table={table} plain={false} />
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

export function DashboardView({ stats, sections = true }) {
  const { t } = useI18n()
  const [part, setPart] = useState('')
  if (!stats) {
    return (
      <section className="dashboard" aria-busy="true">
        <div className="stat-grid">
          {Array.from({ length: 4 }, (_, index) => <article className="stat-card" key={index}><Skeleton lines={2} /></article>)}
        </div>
        <figure className="chart"><Skeleton lines={5} height={200} /></figure>
      </section>
    )
  }
  const section = sections ? stats.sections?.[part] : null
  return (
    <section className="dashboard">
      <div className="stat-grid">
        {stats.cards.map((card) => {
          const key = card.section
          if (!sections || !key || !stats.sections?.[key]) {
            return (
              <article className="stat-card" key={card.label}>
                <span>{t(card.label)}</span>
                <strong>{formatCount(card.value)}</strong>
              </article>
            )
          }
          const active = part === key
          return (
            <button
              className={`stat-card stat-toggle ${active ? 'active' : ''}`}
              key={card.label}
              type="button"
              aria-pressed={active}
              onClick={() => setPart((current) => (current === key ? '' : key))}
            >
              <span>{t(card.label)}</span>
              <strong>{formatCount(card.value)}</strong>
              <small>{active ? t('Свернуть') : t('Подробнее')} <i aria-hidden="true">{active ? '▴' : '▾'}</i></small>
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

function formatCount(value) {
  return typeof value === 'number' ? formatNumber(value) : value
}
