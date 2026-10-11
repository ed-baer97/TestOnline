import { useI18n } from './i18n.jsx'

export function BarChart({ caption, items }) {
  if (!items.length) return null
  const max = Math.max(1, ...items.map((item) => item.value))
  return (
    <figure className="chart">
      <figcaption>{caption}</figcaption>
      <div className="bars">
        {items.map((item) => (
          <div className="bar-col" key={item.key || item.label} title={`${item.label}: ${item.value}`}>
            <span>{item.value}</span>
            <div style={{ height: `${Math.max(item.value ? 8 : 4, (item.value / max) * 120)}px` }} />
            <em>{item.label}</em>
          </div>
        ))}
      </div>
    </figure>
  )
}

export function RateList({ caption, items }) {
  const { t } = useI18n()
  return (
    <figure className="chart">
      <figcaption>{caption}</figcaption>
      <ul className="rates">
        {items.map((item) => (
          <li key={item.text}>
            <span>{item.text}</span>
            <div className="rate-track" aria-hidden="true">
              <div style={{ width: `${item.rate ?? 0}%` }} />
            </div>
            <em>{item.rate == null ? t('нет данных') : `${item.rate}%`}</em>
          </li>
        ))}
      </ul>
    </figure>
  )
}
