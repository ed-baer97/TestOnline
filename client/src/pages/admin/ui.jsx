import { BarChart } from '../../charts.jsx'
import { BANDS } from '../../bands.js'
import { useI18n } from '../../i18n.jsx'

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
          {charts.map((item) => <BarChart key={item.caption} caption={t(item.caption)} items={item.items.map((entry) => ({ ...entry, label: t(entry.label) }))} />)}
        </div>
      )}
      {stats.table?.rows?.length > 0 && (
        <figure className="chart">
          <figcaption>{t(stats.table.caption)}</figcaption>
          <div className="table-wrap">
            <table className="mini-table">
              <thead>
                <tr>{stats.table.columns.map((column) => <th key={column}>{t(column)}</th>)}</tr>
              </thead>
              <tbody>
                {stats.table.rows.map((row) => (
                  <tr key={row.key}>
                    {row.cells.map((cell, index) => <td key={`${row.key}-${index}`}>{typeof cell === 'string' ? t(cell) : cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </figure>
      )}
    </section>
  )
}
