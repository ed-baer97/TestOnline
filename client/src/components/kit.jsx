import { NavLink } from 'react-router-dom'
import { formatNumber, formatPercent, MIN_SAMPLE, rateOf, rateTone } from '../lib/format.js'
import { useI18n } from '../state/i18n.jsx'

export function Crumbs({ items }) {
  const { t } = useI18n()
  const list = (items || []).filter(Boolean)
  if (list.length < 2) return null
  return (
    <nav className="crumbs" aria-label={t('Путь')}>
      {list.map((item, index) => {
        const last = index === list.length - 1
        return (
          <span key={`${item.to || ''}-${item.label}`}>
            {index > 0 && <span className="crumbs-sep" aria-hidden="true">›</span>}
            {last || !item.to ? <span aria-current={last ? 'page' : undefined}>{item.label}</span> : <NavLink to={item.to} end>{item.label}</NavLink>}
          </span>
        )
      })}
    </nav>
  )
}

export function Segments({ items, label }) {
  const { lang, t } = useI18n()
  return (
    <nav className="segments" aria-label={label ? t(label) : undefined}>
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end !== false}>
          {t(item.label)}
          {item.count != null && <em>{formatNumber(item.count, lang)}</em>}
        </NavLink>
      ))}
    </nav>
  )
}

export function KpiGrid({ items }) {
  const { lang, t } = useI18n()
  const visible = (items || []).filter(Boolean)
  if (!visible.length) return null
  return (
    <div className="stat-grid kpi-grid">
      {visible.map((item) => (
        <article className="stat-card" key={item.label}>
          <span>{t(item.label)}</span>
          <strong>{item.node ?? (item.percent ? formatPercent(item.value) : formatNumber(item.value, lang))}</strong>
          {item.hint && <small className="muted">{typeof item.hint === 'string' ? t(item.hint, item.vars) : item.hint}</small>}
        </article>
      ))}
    </div>
  )
}

// Доля верных ответов с учётом размера выборки.
export function Rate({ correct, answered, rate: given, min = MIN_SAMPLE }) {
  const { lang, t } = useI18n()
  const rate = given ?? rateOf(correct, answered)
  const tone = rateTone(rate, answered ?? (rate == null ? 0 : min), min)
  if (tone === 'none') return <span className="rate rate-none">—</span>
  const title = tone === 'thin'
    ? t('Мало данных: {count} ответов. Меньше {min} — оценка ненадёжна.', { count: formatNumber(answered, lang), min })
    : (answered != null ? t('Ответов: {count}', { count: formatNumber(answered, lang) }) : undefined)
  return (
    <span className={`rate rate-${tone}`} title={title}>
      <b>{formatPercent(rate)}</b>
    </span>
  )
}

function Skeleton({ lines = 3, height }) {
  return (
    <div className="skeleton-block" aria-hidden="true" style={height ? { minHeight: height } : undefined}>
      {Array.from({ length: lines }, (_, index) => <span className="skeleton" key={index} />)}
    </div>
  )
}

export function StatsSkeleton({ cards = 4, charts = 2 }) {
  return (
    <div className="stack" aria-busy="true">
      <div className="stat-grid kpi-grid">
        {Array.from({ length: cards }, (_, index) => (
          <article className="stat-card" key={index}><Skeleton lines={2} /></article>
        ))}
      </div>
      <div className="chart-grid">
        {Array.from({ length: charts }, (_, index) => (
          <figure className="chart" key={index}><Skeleton lines={5} height={200} /></figure>
        ))}
      </div>
      <figure className="chart"><Skeleton lines={6} /></figure>
    </div>
  )
}

export function Empty({ text, hint }) {
  const { t } = useI18n()
  return (
    <div className="empty">
      <p>{t(text)}</p>
      {hint && <p className="muted">{t(hint)}</p>}
    </div>
  )
}

export function SearchBox({ value, onChange, placeholder = 'Поиск', label = 'Поиск' }) {
  const { t } = useI18n()
  return (
    <input
      className="search-box"
      type="search"
      aria-label={t(label)}
      placeholder={t(placeholder)}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}
