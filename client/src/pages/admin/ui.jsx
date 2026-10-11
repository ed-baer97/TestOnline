import { BarChart } from '../../charts.jsx'
import { BANDS } from '../../lib/bands.js'

export function Notice({ error, notice }) {
  return (
    <>
      {error && <p className="form-error">{error}</p>}
      {notice && <p className="saved">{notice}</p>}
    </>
  )
}

export function GroupChecks({ groups, onChange }) {
  return (
    <div className="checks">
      {BANDS.map((band) => (
        <label className="check" key={band.id}>
          <input
            type="checkbox"
            checked={Boolean(groups[band.id])}
            onChange={(event) => onChange({ ...groups, [band.id]: event.target.checked })}
          />
          {band.label}
        </label>
      ))}
    </div>
  )
}

export function DashboardView({ stats }) {
  if (!stats) return <p className="muted">Загрузка…</p>
  const charts = stats.charts.filter((item) => item.items.length)
  return (
    <section className="dashboard">
      {stats.note && <p className="muted">{stats.note}</p>}
      <div className="stat-grid">
        {stats.cards.map((card) => (
          <article className="stat-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>
      {charts.length > 0 && (
        <div className="chart-grid">
          {charts.map((item) => <BarChart key={item.caption} caption={item.caption} items={item.items} />)}
        </div>
      )}
      {stats.table?.rows?.length > 0 && (
        <figure className="chart">
          <figcaption>{stats.table.caption}</figcaption>
          <div className="table-wrap">
            <table className="mini-table">
              <thead>
                <tr>{stats.table.columns.map((column) => <th key={column}>{column}</th>)}</tr>
              </thead>
              <tbody>
                {stats.table.rows.map((row) => (
                  <tr key={row.key}>
                    {row.cells.map((cell, index) => <td key={`${row.key}-${index}`}>{cell}</td>)}
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
