import { useI18n } from './i18n.jsx'

function labelLines(label) {
  const text = String(label ?? '')
  const at = text.indexOf(' ')
  if (at <= 0) return [text]
  return [text.slice(0, at), text.slice(at + 1).trim()]
}

export function BarChart({ caption, items }) {
  if (!items.length) return null
  const max = Math.max(1, ...items.map((item) => item.value))
  return (
    <figure className="chart">
      <figcaption>{caption}</figcaption>
      <div className="bars">
        {items.map((item) => {
          const lines = labelLines(item.label)
          return (
            <div className="bar-col" key={item.key || item.label}>
              <span>{item.text ?? item.value}</span>
              <div style={{ height: `${Math.max(item.value ? 8 : 4, (item.value / max) * 120)}px` }} />
              <em title={`${item.label}: ${item.text ?? item.value}`}>
                {lines[0]}
                {lines[1] ? <><br />{lines[1]}</> : null}
              </em>
            </div>
          )
        })}
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
          <li key={item.key || item.text}>
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
