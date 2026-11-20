import { useState } from 'react'
import { MIN_SAMPLE, formatNumber, formatPercent, rateTone } from '../lib/format.js'
import { useI18n } from '../state/i18n.jsx'

function numericValue(item) {
  if (!item || item.empty || item.value == null || item.value === '') return null
  const num = Number(item.value)
  return Number.isFinite(num) ? num : null
}

export function BarChart({ caption, items = [], order, percent = false, layout, note, limit = 12, plain = false }) {
  const { lang, t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  if (!items?.length) return null

  const sorted = order === 'value'
    ? [...items].sort((a, b) => {
      const av = numericValue(a)
      const bv = numericValue(b)
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return bv - av
    })
    : items

  const valid = sorted.map(numericValue).filter((value) => value != null)
  const max = percent ? 100 : Math.max(1, ...valid)
  const vertical = layout === 'vertical' || (!layout && order !== 'value' && !percent && sorted.length <= 8)
  const shown = !vertical && !expanded && sorted.length > limit ? sorted.slice(0, limit) : sorted
  const body = (
    <>
      {vertical ? (
        <div className="bars">
          {shown.map((item) => {
            const val = numericValue(item)
            const display = item.text ?? (val == null ? '—' : percent ? formatPercent(val) : formatNumber(val, lang))
            const tone = percent ? rateTone(val, item.answered ?? (val == null ? 0 : MIN_SAMPLE)) : ''
            const height = val == null ? 4 : Math.max(val > 0 ? 8 : 4, Math.round((val / max) * 120))
            const title = [item.label, display, item.hint].filter(Boolean).join(' · ')
            return (
              <div className="bar-col" key={item.key || item.label} title={title}>
                <span>{display}</span>
                <div className={tone ? `tone-${tone}` : undefined} style={{ height: `${height}px` }} />
                <em>{item.label}</em>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bar-list">
          {shown.map((item) => {
            const val = numericValue(item)
            const display = item.text ?? (val == null ? '—' : percent ? formatPercent(val) : formatNumber(val, lang))
            const tone = percent ? rateTone(val, item.answered ?? (val == null ? 0 : MIN_SAMPLE)) : ''
            const width = val == null ? 0 : Math.max(val > 0 ? 3 : 0, Math.min(100, Math.round((val / max) * 100)))
            const title = [item.label, display, item.hint].filter(Boolean).join(' · ')
            return (
              <div className="bar-row" key={item.key || item.label} title={title}>
                <span className="bar-label">{item.label}</span>
                <div className="bar-track" aria-hidden="true">
                  <div className={`bar-fill ${tone ? `tone-${tone}` : ''}`} style={{ width: `${width}%` }} />
                </div>
                <em className="bar-val">{display}</em>
              </div>
            )
          })}
        </div>
      )}
      {!vertical && sorted.length > limit && (
        <div className="chart-foot">
          <span className="muted">
            {t('Показано {shown} из {total}', { shown: formatNumber(shown.length, lang), total: formatNumber(sorted.length, lang) })}
          </span>
          <button className="ghost small" type="button" onClick={() => setExpanded((value) => !value)}>
            {expanded ? t('Свернуть') : t('Показать все')}
          </button>
        </div>
      )}
      {note && <p className="muted chart-note">{note}</p>}
    </>
  )
  if (plain) return <div className="chart-plain">{body}</div>
  return (
    <figure className="chart">
      {caption && <figcaption>{caption}</figcaption>}
      {body}
    </figure>
  )
}

export function RateList({ caption, items = [] }) {
  const { t } = useI18n()
  return (
    <figure className="chart">
      <figcaption>{caption}</figcaption>
      <ul className="rates">
        {items.map((item) => {
          const tone = rateTone(item.rate, item.answered ?? (item.rate == null ? 0 : MIN_SAMPLE))
          return (
            <li key={item.text}>
              <span>{item.text}</span>
              <div className="rate-track" aria-hidden="true">
                <div className={`tone-${tone}`} style={{ width: `${item.rate ?? 0}%` }} />
              </div>
              <em>{item.rate == null ? t('нет данных') : `${item.rate}%`}</em>
            </li>
          )
        })}
      </ul>
    </figure>
  )
}
