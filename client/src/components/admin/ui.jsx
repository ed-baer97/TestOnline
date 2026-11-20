import { BANDS } from '../../lib/bands.js'
import { formatNumber } from '../../lib/format.js'
import { pick, useI18n } from '../../state/i18n.jsx'
import { BarChart } from '../charts.jsx'

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

function groupMeta(group, lang, t) {
  return t('{organizations} орг. · {classes} кл. · {learners} тест. · {admins} адм.', {
    organizations: formatNumber(group.organizations, lang),
    classes: formatNumber(group.classes, lang),
    learners: formatNumber(group.learners, lang),
    admins: formatNumber(group.admins, lang),
  })
}

function MiniTable({ columns, rows }) {
  const { t } = useI18n()
  return (
    <div className="table-wrap">
      <table className="mini-table">
        <thead>
          <tr>{columns.map((column) => <th key={column}>{t(column)}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              {row.cells.map((cell, index) => (
                <td key={`${row.key}-${index}`}>{typeof cell === 'string' ? t(cell) : cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DashboardChart({ item }) {
  const { lang, t } = useI18n()
  const groups = item.groups?.length > 1 ? item.groups : null
  if (!groups) {
    return (
      <BarChart
        caption={t(item.caption)}
        items={item.items.map((entry) => ({ ...entry, label: t(entry.label) }))}
      />
    )
  }
  return (
    <figure className="chart chart-span">
      <figcaption>{t(item.caption)}</figcaption>
      <div className="accordion">
        {groups.map((group) => (
          <details key={group.key}>
            <summary>
              <span className="summary-line">
                <span>{pick(lang, group.name, group.nameKk)}</span>
                <span className="muted">{groupMeta(group, lang, t)}</span>
              </span>
            </summary>
            <BarChart
              plain
              order="value"
              items={group.items.map((entry) => ({ ...entry, label: t(entry.label) }))}
              limit={group.items.length}
            />
          </details>
        ))}
      </div>
    </figure>
  )
}

function DashboardTable({ table }) {
  const { lang, t } = useI18n()
  const groups = table.groups?.length > 1 ? table.groups : null
  return (
    <figure className="chart">
      <figcaption>{t(table.caption)}</figcaption>
      {groups ? (
        <div className="accordion">
          {groups.map((group) => (
            <details key={group.key}>
              <summary>
                <span className="summary-line">
                  <span>{pick(lang, group.name, group.nameKk)}</span>
                  <span className="muted">{groupMeta(group, lang, t)}</span>
                </span>
              </summary>
              <MiniTable columns={table.columns} rows={group.rows} />
            </details>
          ))}
        </div>
      ) : (
        <MiniTable columns={table.columns} rows={table.rows} />
      )}
    </figure>
  )
}

export function DashboardView({ stats }) {
  const { t } = useI18n()
  if (!stats) return <p className="muted">{t('Загрузка…')}</p>
  const charts = stats.charts.filter((item) => item.items.length)
  return (
    <section className="dashboard">
      {stats.note && <p className="muted">{t(stats.note)}</p>}
      <div className="stat-grid">
        {stats.cards.map((card) => (
          <article className="stat-card" key={card.label}>
            <span>{t(card.label)}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>
      {charts.length > 0 && (
        <div className="chart-grid">
          {charts.map((item) => <DashboardChart key={item.caption} item={item} />)}
        </div>
      )}
      {stats.table?.rows?.length > 0 && <DashboardTable table={stats.table} />}
    </section>
  )
}
