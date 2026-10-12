import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { formatNumber, formatPercent, MIN_SAMPLE, rateTone } from './format.js'
import { Skeleton } from './kit.jsx'
import { useI18n } from './i18n.jsx'

const EChart = lazy(() => import('./echart.jsx'))

const MAX_BARS = 100
const ROW = 30
const FONT = 'Manrope, "Segoe UI", sans-serif'

function readColors() {
  const style = getComputedStyle(document.documentElement)
  const get = (name, fallback) => style.getPropertyValue(name).trim() || fallback
  return {
    ink: get('--ink', '#eaf6ff'),
    muted: get('--muted', '#9bb4c9'),
    line: get('--line', 'rgba(90, 220, 255, 0.28)'),
    accent: get('--accent', '#3d8bff'),
    green: get('--green', '#22c55e'),
    yellow: get('--yellow', '#ffd23f'),
    red: get('--red', '#ff3b4e'),
    card: get('--card-solid', 'rgba(10, 28, 48, 0.9)'),
    grey: get('--muted', '#9bb4c9'),
  }
}

function useThemeColors() {
  const [colors, setColors] = useState(() => readColors())
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(readColors()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return colors
}

function isPercentChart(items, percent) {
  if (percent != null) return percent
  return items.some((item) => typeof item.text === 'string' && item.text.trim().endsWith('%'))
}

function toneOf(item, percent) {
  if (item.tone) return item.tone
  if (item.empty) return 'none'
  if (!percent) return 'plain'
  return rateTone(item.value, item.answered ?? MIN_SAMPLE)
}

function colorFor(tone, colors) {
  if (tone === 'high') return colors.green
  if (tone === 'mid') return colors.yellow
  if (tone === 'low') return colors.red
  if (tone === 'thin' || tone === 'none') return colors.grey
  return colors.accent
}

function valueText(item, percent, t) {
  if (item.empty) return t('нет данных')
  if (item.text != null) return String(item.text).replace(/(\d)%$/, '$1 %')
  return percent ? formatPercent(item.value) : formatNumber(item.value)
}

function tooltipText(item, percent, t) {
  const lines = [`<b>${item.label}</b>`, valueText(item, percent, t)]
  if (percent && item.answered != null && !item.empty) {
    lines.push(item.answered < MIN_SAMPLE
      ? t('Мало данных: {count} ответов. Меньше {min} — оценка ненадёжна.', { count: formatNumber(item.answered), min: MIN_SAMPLE })
      : t('Ответов: {count}', { count: formatNumber(item.answered) }))
  }
  if (item.hint) lines.push(item.hint)
  return lines.join('<br/>')
}

function prepare(items, order, percent) {
  const list = items
    .filter((item) => item && item.label != null)
    .map((item) => ({ ...item, value: item.empty ? 0 : Number(item.value) || 0 }))
  if (order !== 'value') return list
  return list.sort((a, b) => {
    if (Boolean(a.empty) !== Boolean(b.empty)) return a.empty ? 1 : -1
    if (percent) {
      const aThin = (a.answered ?? MIN_SAMPLE) < MIN_SAMPLE
      const bThin = (b.answered ?? MIN_SAMPLE) < MIN_SAMPLE
      if (aThin !== bThin) return aThin ? 1 : -1
    }
    return b.value - a.value || String(a.label).localeCompare(String(b.label), 'ru')
  })
}

// Горизонтальные столбики с рейтингом (order="value") или столбики в заданном
// порядке (layout="vertical"). Доля верных окрашивается по шкале, малая выборка — серым.
export function BarChart({ caption, items, order = 'given', layout = 'horizontal', limit = 12, percent, onPick, note }) {
  const { t } = useI18n()
  const colors = useThemeColors()
  const [all, setAll] = useState(false)
  const isPercent = isPercentChart(items || [], percent)
  const prepared = useMemo(() => prepare(items || [], order, isPercent), [items, order, isPercent])
  const view = useMemo(() => {
    const horizontal = layout === 'horizontal' || prepared.length > 24
    const cap = all ? MAX_BARS : limit
    const shown = horizontal ? prepared.slice(0, cap) : prepared
    return {
      horizontal,
      shown,
      rest: prepared.length - shown.length,
      height: horizontal ? Math.max(120, shown.length * ROW + 28) : 240,
      option: buildOption(shown, { horizontal, isPercent, colors, t, max: isPercent ? 100 : null }),
    }
  }, [prepared, all, limit, layout, isPercent, colors, t])
  if (!prepared.length) return null

  const { shown, rest, height, option } = view
  const label = `${caption}: ${shown.map((item) => `${item.label} — ${valueText(item, isPercent, t)}`).join(', ')}`

  return (
    <figure className="chart">
      <figcaption>{caption}</figcaption>
      <Suspense fallback={<Skeleton lines={Math.min(6, shown.length)} height={height} />}>
        <EChart option={option} height={height} label={label} onClick={onPick ? (params) => onPick(shown[params.dataIndex]) : undefined} />
      </Suspense>
      {(rest > 0 || all) && (
        <footer className="chart-foot">
          {rest > 0 && prepared.length <= MAX_BARS && (
            <button className="ghost small" type="button" onClick={() => setAll(true)}>{t('Показать все ({count})', { count: formatNumber(prepared.length) })}</button>
          )}
          {rest > 0 && prepared.length > MAX_BARS && (
            <span className="muted">{t('Ещё {count} — в таблице ниже', { count: formatNumber(rest) })}</span>
          )}
          {all && <button className="ghost small" type="button" onClick={() => setAll(false)}>{t('Свернуть')}</button>}
        </footer>
      )}
      {note && <p className="muted chart-note">{note}</p>}
    </figure>
  )
}

function buildOption(items, { horizontal, isPercent, colors, t, max }) {
  const categories = items.map((item) => String(item.label))
  const data = items.map((item) => ({
    value: item.value,
    itemStyle: { color: colorFor(toneOf(item, isPercent), colors), borderRadius: horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0] },
    label: { formatter: () => valueText(item, isPercent, t) },
  }))
  const axisLabel = { color: colors.muted, fontFamily: FONT, fontSize: 12 }
  const valueAxis = {
    type: 'value',
    max,
    min: 0,
    splitNumber: horizontal ? 4 : 5,
    // В горизонтальном рейтинге значения подписаны на столбиках, шкала не нужна.
    axisLabel: { ...axisLabel, show: !horizontal, formatter: (value) => (isPercent ? `${value} %` : formatNumber(value)) },
    splitLine: { lineStyle: { color: colors.line, opacity: 0.6 } },
    axisLine: { show: false },
    axisTick: { show: false },
  }
  const categoryAxis = {
    type: 'category',
    data: categories,
    inverse: horizontal,
    axisLabel: {
      ...axisLabel,
      color: colors.ink,
      width: horizontal ? 150 : undefined,
      overflow: 'truncate',
      interval: 0,
      rotate: !horizontal && categories.length > 8 ? 30 : 0,
    },
    axisLine: { lineStyle: { color: colors.line } },
    axisTick: { show: false },
  }
  return {
    animationDuration: 300,
    textStyle: { fontFamily: FONT },
    grid: horizontal
      ? { left: 8, right: 64, top: 8, bottom: 8, containLabel: true }
      : { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'item',
      confine: true,
      backgroundColor: colors.card,
      borderColor: colors.line,
      textStyle: { color: colors.ink, fontFamily: FONT, fontSize: 12 },
      formatter: (params) => tooltipText(items[params.dataIndex], isPercent, t),
    },
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxis,
    series: [{
      type: 'bar',
      data,
      barMaxWidth: horizontal ? 18 : 42,
      barMinHeight: 2,
      label: {
        show: true,
        position: horizontal ? 'right' : 'top',
        color: colors.ink,
        fontFamily: FONT,
        fontSize: 12,
      },
      emphasis: { focus: 'self' },
    }],
  }
}

export function RateList({ caption, items }) {
  const { t } = useI18n()
  return (
    <figure className="chart">
      <figcaption>{caption}</figcaption>
      <ul className="rates">
        {items.map((item) => {
          const tone = rateTone(item.rate, item.answered ?? MIN_SAMPLE)
          return (
            <li key={item.key || item.text}>
              <span>{item.text}</span>
              <div className="rate-track" aria-hidden="true">
                <div className={`tone-${tone}`} style={{ width: `${item.rate ?? 0}%` }} />
              </div>
              <em>{item.rate == null ? t('нет данных') : formatPercent(item.rate)}</em>
            </li>
          )
        })}
      </ul>
    </figure>
  )
}
