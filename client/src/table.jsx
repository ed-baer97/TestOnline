import { Fragment, useMemo, useState } from 'react'
import { formatNumber } from './format.js'
import { useI18n } from './i18n.jsx'
import { SearchBox } from './kit.jsx'

function cellValue(column, row) {
  if (column.value) return column.value(row)
  return row[column.key]
}

function isEmpty(value) {
  return value == null || value === ''
}

function compare(a, b, lang) {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), lang === 'kk' ? 'kk' : 'ru', { numeric: true, sensitivity: 'base' })
}

function exportText(column, row, t) {
  if (column.exportValue) return column.exportValue(row)
  const value = cellValue(column, row)
  if (value == null) return ''
  if (typeof value === 'object') return value.ru ?? ''
  return typeof value === 'string' ? t(value) : String(value)
}

function downloadCsv(name, columns, rows, t) {
  const header = columns.map((column) => `"${t(column.label).replace(/"/g, '""')}"`).join(';')
  const lines = rows.map((row) => columns.map((column) => `"${String(exportText(column, row, t)).replace(/"/g, '""')}"`).join(';'))
  const blob = new Blob([`\uFEFF${[header, ...lines].join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${name}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

// Таблица с сортировкой по колонкам, поиском, постраничным показом,
// раскрывающимися строками и выгрузкой в CSV.
export function DataTable({
  caption,
  columns,
  rows,
  rowKey = 'id',
  defaultSort,
  search,
  searchPlaceholder = 'Поиск',
  pageSize = 50,
  expand,
  exportName,
  toolbar,
  empty = 'Пока пусто.',
  compact = false,
  plain = false,
}) {
  const { lang, t } = useI18n()
  const visibleColumns = useMemo(() => columns.filter((column) => !column.hidden), [columns])
  const [sort, setSort] = useState(() => defaultSort || null)
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(pageSize)
  const [open, setOpen] = useState(() => new Set())

  const keyOf = typeof rowKey === 'function' ? rowKey : (row) => row[rowKey]

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle || !search) return rows
    return rows.filter((row) => String(search(row) || '').toLowerCase().includes(needle))
  }, [rows, query, search])

  const sorted = useMemo(() => {
    if (!sort) return filtered
    const column = visibleColumns.find((item) => item.key === sort.key)
    if (!column) return filtered
    const list = filtered.map((row, index) => ({ row, index, value: cellValue(column, row) }))
    list.sort((a, b) => {
      // Пустые значения всегда внизу, независимо от направления сортировки.
      const aEmpty = isEmpty(a.value)
      const bEmpty = isEmpty(b.value)
      if (aEmpty || bEmpty) return aEmpty === bEmpty ? a.index - b.index : (aEmpty ? 1 : -1)
      const result = compare(a.value, b.value, lang)
      if (result !== 0) return sort.dir === 'desc' ? -result : result
      return a.index - b.index
    })
    return list.map((item) => item.row)
  }, [filtered, sort, visibleColumns, lang])

  const page = sorted.slice(0, shown)

  function toggleSort(column) {
    if (column.sortable === false) return
    setSort((current) => {
      if (!current || current.key !== column.key) return { key: column.key, dir: column.num ? 'desc' : 'asc' }
      return { key: column.key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
    })
  }

  function toggleOpen(key) {
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const hasTools = Boolean(search || exportName || toolbar)
  const body = (
    <>
      {(caption || hasTools) && (
        <div className="table-head">
          {caption && <p className="table-caption">{t(caption)}</p>}
          {hasTools && (
            <div className="table-tools">
              {toolbar}
              {search && <SearchBox value={query} onChange={(value) => { setQuery(value); setShown(pageSize) }} placeholder={searchPlaceholder} />}
              {exportName && rows.length > 0 && (
                <button className="ghost small" type="button" onClick={() => downloadCsv(exportName, visibleColumns, sorted, t)}>
                  {t('Скачать CSV')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {sorted.length === 0 ? (
        <p className="muted table-empty">{query ? t('Ничего не найдено') : t(empty)}</p>
      ) : (
        <div className="table-wrap">
          <table className={`mini-table data-table ${compact ? 'compact' : ''}`}>
            <thead>
              <tr>
                {expand && <th className="expand-cell" aria-label={t('Подробнее')} />}
                {visibleColumns.map((column) => {
                  const active = sort?.key === column.key
                  const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
                  return (
                    <th
                      key={column.key}
                      className={`${column.num ? 'num' : ''} ${active ? 'sorted' : ''}`}
                      style={column.width ? { width: column.width } : undefined}
                      aria-sort={column.sortable === false ? undefined : ariaSort}
                    >
                      {column.sortable === false ? (
                        <span>{t(column.label)}</span>
                      ) : (
                        <button type="button" className="sort-button" onClick={() => toggleSort(column)} title={t('Сортировать')}>
                          {t(column.label)}
                          <i aria-hidden="true">{active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}</i>
                        </button>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {page.map((row) => {
                const key = keyOf(row)
                const expanded = expand && open.has(key)
                return (
                  <Fragment key={key}>
                    <tr className={expanded ? 'open' : ''}>
                      {expand && (
                        <td className="expand-cell">
                          <button
                            type="button"
                            className="expand-button"
                            aria-expanded={Boolean(expanded)}
                            aria-label={t('Подробнее')}
                            onClick={() => toggleOpen(key)}
                          >
                            ▸
                          </button>
                        </td>
                      )}
                      {visibleColumns.map((column) => {
                        const raw = cellValue(column, row)
                        let content
                        if (column.render) content = column.render(row)
                        else if (typeof raw === 'number') content = formatNumber(raw)
                        else if (raw && typeof raw === 'object' && 'ru' in raw) content = lang === 'kk' && raw.kk ? raw.kk : raw.ru
                        else content = raw == null || raw === '' ? '—' : (typeof raw === 'string' ? t(raw) : raw)
                        return <td key={column.key} className={column.num ? 'num' : ''}>{content}</td>
                      })}
                    </tr>
                    {expanded && (
                      <tr className="expand-row">
                        <td colSpan={visibleColumns.length + 1}>{expand(row)}</td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {sorted.length > pageSize && (
        <div className="table-foot">
          <span className="muted">{t('Показано {shown} из {total}', { shown: formatNumber(Math.min(shown, sorted.length)), total: formatNumber(sorted.length) })}</span>
          {shown < sorted.length && (
            <button className="ghost small" type="button" onClick={() => setShown((value) => value + pageSize)}>{t('Показать ещё')}</button>
          )}
          {shown > pageSize && (
            <button className="ghost small" type="button" onClick={() => setShown(pageSize)}>{t('Свернуть')}</button>
          )}
        </div>
      )}
    </>
  )

  if (plain) return <div className="table-plain">{body}</div>
  return <figure className="chart table-card">{body}</figure>
}
