import { useMemo, useState } from 'react'
import { MIN_PERSON_SAMPLE, MIN_SAMPLE, formatNumber, rateOf } from '../../format.js'
import { pick, useI18n } from '../../i18n.jsx'
import { Crumbs, Empty, Rate } from '../../kit.jsx'
import { DataTable } from '../../table.jsx'

export function StatsHeader({ crumbs, title, subtitle, aside }) {
  return (
    <div className="stats-head">
      <Crumbs items={crumbs} />
      <div className="section-head stats-title">
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {aside}
      </div>
    </div>
  )
}

export function rateColumn(label = 'Доля верных', min = MIN_SAMPLE) {
  return {
    key: 'rate',
    label,
    num: true,
    value: (row) => (row.answered ? rateOf(row.correct, row.answered) : null),
    render: (row) => <Rate correct={row.correct} answered={row.answered} min={min} />,
    exportValue: (row) => (row.answered ? `${rateOf(row.correct, row.answered)}% (${row.answered})` : ''),
  }
}

export function nameColumn(key, label, lang, pickName = (row) => pick(lang, row.name, row.nameKk)) {
  return { key, label, value: pickName, render: (row) => <span className="cell-name">{pickName(row)}</span> }
}

// Участники одного урока или квиза внутри организации.
export function PeopleTable({ people, kind = 'lesson' }) {
  const rows = people || []
  const countColumn = kind === 'quiz'
    ? { key: 'runs', label: 'Запуски', num: true }
    : { key: 'attempts', label: 'Попытки', num: true }
  return (
    <DataTable
      plain
      compact
      columns={[
        { key: 'name', label: kind === 'quiz' ? 'Участник' : 'Тестируемый' },
        countColumn,
        { key: 'correct', label: 'Верных ответов', num: true },
        { key: 'answered', label: 'Ответов', num: true },
        rateColumn('Доля верных', MIN_PERSON_SAMPLE),
      ]}
      rows={rows}
      rowKey={(row) => row.id || row.name}
      defaultSort={{ key: 'rate', dir: 'desc' }}
      search={rows.length > 8 ? (row) => row.name : undefined}
      searchPlaceholder="Имя"
      pageSize={30}
      empty={kind === 'quiz' ? 'нет участников' : 'нет тестируемых'}
    />
  )
}

// Вопросы, где выбирали неверный вариант, с фильтром по материалу.
export function MistakeTable({ items, caption = 'Чаще всего ошибаются', showKind = false }) {
  const { lang, t } = useI18n()
  const [source, setSource] = useState('')
  const sources = useMemo(() => {
    const seen = new Map()
    for (const item of items || []) {
      const key = `${item.kind}:${item.source}`
      if (!seen.has(key)) seen.set(key, { id: key, label: pick(lang, item.source, item.sourceKk), kind: item.kind })
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label, lang === 'kk' ? 'kk' : 'ru'))
  }, [items, lang])
  const rows = useMemo(() => (items || [])
    .filter((item) => !source || `${item.kind}:${item.source}` === source)
    .map((item) => ({
      ...item,
      id: `${item.kind}:${item.source}:${item.text}`,
      total: item.wrong + item.correct,
      wrongRate: item.wrong + item.correct ? Math.round((item.wrong / (item.wrong + item.correct)) * 100) : null,
    })), [items, source])

  if (!items?.length) return <Empty text="Ошибок пока нет." />
  return (
    <DataTable
      caption={caption}
      columns={[
        { key: 'text', label: 'Вопрос', value: (row) => pick(lang, row.text, row.textKk), render: (row) => <span className="cell-wrap">{pick(lang, row.text, row.textKk)}</span> },
        {
          key: 'source',
          label: 'Материал',
          value: (row) => pick(lang, row.source, row.sourceKk),
          render: (row) => <span className="cell-wrap muted">{showKind ? `${t(row.kind)} · ` : ''}{pick(lang, row.source, row.sourceKk)}</span>,
        },
        { key: 'wrong', label: 'Ошибок', num: true },
        { key: 'correct', label: 'Верных ответов', num: true },
        {
          key: 'wrongRate',
          label: 'Доля ошибок',
          num: true,
          render: (row) => (row.wrongRate == null ? '—' : <span className={`rate ${row.wrongRate >= 50 ? 'rate-low' : row.wrongRate >= 25 ? 'rate-mid' : 'rate-high'}`} title={t('Ответов: {count}', { count: formatNumber(row.total) })}><b>{row.wrongRate} %</b></span>),
          exportValue: (row) => (row.wrongRate == null ? '' : `${row.wrongRate}%`),
        },
      ]}
      rows={rows}
      defaultSort={{ key: 'wrong', dir: 'desc' }}
      search={(row) => `${row.text} ${row.textKk || ''} ${row.source}`}
      searchPlaceholder="Текст вопроса"
      pageSize={20}
      exportName="mistakes"
      toolbar={sources.length > 1 ? (
        <select className="table-select" aria-label={t('Материал')} value={source} onChange={(event) => setSource(event.target.value)}>
          <option value="">{t('Все материалы')}</option>
          {sources.map((item) => <option key={item.id} value={item.id}>{showKind ? `${t(item.kind)} · ` : ''}{item.label}</option>)}
        </select>
      ) : null}
      empty="Ошибок пока нет."
    />
  )
}
