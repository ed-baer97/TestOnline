import { useEffect, useState } from 'react'
import { api } from '../../api.js'
import { useI18n } from '../../i18n.jsx'
import { Notice } from './ui.jsx'

export function Classes() {
  const { t } = useI18n()
  const [tree, setTree] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [trackName, setTrackName] = useState('')

  function load() {
    return api.structure().then(setTree)
  }

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [])

  async function run(action) {
    setError('')
    setNotice('')
    try {
      await action()
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function addTrack(event) {
    event.preventDefault()
    await run(async () => {
      await api.createTrack({ name: trackName })
      setTrackName('')
      setNotice('Курс создан')
    })
  }

  return (
    <section className="stack">
      <div className="section-head"><h1>{t('Классы')}</h1></div>
      <Notice error={error} notice={notice} />
      {tree === null && !error && <p className="muted">{t('Загрузка…')}</p>}
      {tree?.sections.map((section) => (
        <div className="band-block" key={section.id}>
          <h2>{t(section.label)}</h2>
          {section.kind === 'school' && (
            <div className="accordion">
              {section.grades.map((grade) => (
                <details key={grade.grade} open>
                  <summary>
                    {t(grade.label)}
                    <span className="muted"> {grade.classes.length ? grade.classes.map((item) => item.name).join(', ') : t('нет классов')}</span>
                  </summary>
                  {grade.classes.map((item) => (
                    <ClassLine key={item.id} item={item} onRun={run} />
                  ))}
                  <AddLine placeholder={`${grade.grade}а`} onAdd={(name) => api.createClass({ grade: grade.grade, name })} onRun={run} />
                </details>
              ))}
            </div>
          )}
          {section.kind === 'students' && (
            <div className="stack">
              <form className="add-line" onSubmit={addTrack}>
                <input value={trackName} onChange={(event) => setTrackName(event.target.value)} placeholder={t('1 курс')} />
                <button className="primary" type="submit">{t('Добавить курс')}</button>
              </form>
              <div className="accordion">
                {section.tracks.map((track) => (
                  <details key={track.id} open>
                    <summary>
                      {track.name}
                      <span className="muted"> {track.classes.length ? track.classes.map((item) => item.name).join(', ') : t('нет групп')}</span>
                    </summary>
                    <TrackName track={track} onRun={run} />
                    {track.classes.map((item) => (
                      <ClassLine key={item.id} item={item} onRun={run} />
                    ))}
                    <AddLine placeholder="ИС-21" onAdd={(name) => api.createClass({ trackId: track.id, name })} onRun={run} />
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  )
}

function AddLine({ placeholder, onAdd, onRun }) {
  const { t } = useI18n()
  const [name, setName] = useState('')

  async function submit(event) {
    event.preventDefault()
    await onRun(async () => {
      await onAdd(name)
      setName('')
    })
  }

  return (
    <form className="add-line" onSubmit={submit}>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder={placeholder} />
      <button className="ghost" type="submit">{t('Добавить')}</button>
    </form>
  )
}

function ClassLine({ item, onRun }) {
  const { t } = useI18n()
  const [name, setName] = useState(item.name)

  return (
    <div className="class-line">
      <form
        className="add-line"
        onSubmit={(event) => {
          event.preventDefault()
          onRun(() => api.updateClass(item.id, { name }))
        }}
      >
        <input aria-label={t('Класс {name}', { name: item.name })} value={name} onChange={(event) => setName(event.target.value)} />
        <button className="ghost" type="submit">{t('Сохранить')}</button>
      </form>
      <span className="muted">{item.learners}</span>
      <button
        className="ghost"
        type="button"
        onClick={() => {
          if (window.confirm(t('Удалить «{name}»?', { name: item.name }))) onRun(() => api.deleteClass(item.id))
        }}
      >
        {t('Удалить')}
      </button>
    </div>
  )
}

function TrackName({ track, onRun }) {
  const { t } = useI18n()
  const [name, setName] = useState(track.name)

  return (
    <form
      className="add-line"
      onSubmit={(event) => {
        event.preventDefault()
        onRun(() => api.updateTrack(track.id, { name }))
      }}
    >
      <input aria-label={t('Название курса')} value={name} onChange={(event) => setName(event.target.value)} />
      <button className="ghost" type="submit">{t('Переименовать')}</button>
      <button
        className="ghost"
        type="button"
        onClick={() => {
          if (window.confirm(t('Удалить курс «{name}»?', { name: track.name }))) onRun(() => api.deleteTrack(track.id))
        }}
      >
        {t('Удалить курс')}
      </button>
    </form>
  )
}

function classGroups(sections) {
  const groups = []
  for (const section of sections || []) {
    if (section.kind === 'school') {
      for (const grade of section.grades) {
        if (grade.classes.length) groups.push({ label: grade.label, classes: grade.classes })
      }
    } else {
      for (const track of section.tracks) {
        if (track.classes.length) groups.push({ label: track.name, classes: track.classes })
      }
    }
  }
  return groups
}

const PAGE = 100

export function Learners() {
  const { t } = useI18n()
  const [learners, setLearners] = useState(null)
  const [total, setTotal] = useState(0)
  const [groups, setGroups] = useState([])
  const [filter, setFilter] = useState({ classId: '', search: '' })
  const [searchText, setSearchText] = useState('')
  const [form, setForm] = useState({ displayName: '', login: '', password: '', classId: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [imported, setImported] = useState(null)
  const [importing, setImporting] = useState(false)

  function loadGroups() {
    return api.structure().then((tree) => {
      const nextGroups = classGroups(tree.sections)
      const first = nextGroups[0]?.classes[0]?.id || ''
      setGroups(nextGroups)
      setForm((current) => ({ ...current, classId: current.classId || first }))
    })
  }

  function loadPage(offset = 0) {
    return api.learners({ ...filter, offset, limit: PAGE }).then((data) => {
      setTotal(data.total)
      setLearners((current) => (offset > 0 && current ? [...current, ...data.learners] : data.learners))
    })
  }

  function load() {
    return Promise.all([loadGroups(), loadPage(0)])
  }

  useEffect(() => {
    loadGroups().catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    loadPage(0).catch((err) => setError(err.message))
  }, [filter])

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilter((current) => (current.search === searchText.trim() ? current : { ...current, search: searchText.trim() }))
    }, 300)
    return () => clearTimeout(timer)
  }, [searchText])

  function patch(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function create(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      const created = { login: form.login, password: form.password }
      await api.createLearner(form)
      setForm((current) => ({ ...current, displayName: '', login: '', password: '' }))
      setNotice(`Тестируемый создан. Логин: ${created.login}. Пароль: ${created.password}.`)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(person) {
    if (!window.confirm(t('Удалить {name}?', { name: person.displayName }))) return
    setError('')
    setNotice('')
    try {
      await api.deleteLearner(person.id)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function upload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    setNotice('')
    setImported(null)
    setImporting(true)
    try {
      const data = await api.importLearners(file)
      setImported(data)
      if (data.created) setNotice(t('Создано тестируемых: {count}. Сохраните таблицу с паролями: повторно их увидеть нельзя.', { count: data.created }))
      else if (!data.errors?.length) setNotice('В файле не нашлось новых тестируемых')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  function downloadPasswords() {
    if (!imported?.learners?.length) return
    const lines = [['Класс', 'Имя', 'Логин', 'Пароль'].join(';')]
    for (const person of imported.learners) {
      lines.push([person.classLabel, person.displayName, person.login, person.password].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    }
    const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'paroli-testiruemyh.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const shown = learners?.length || 0

  return (
    <section className="stack">
      <div className="section-head">
        <h1>{t('Тестируемые')}</h1>
        <div className="row-actions">
          <a className="ghost" href="/api/admin/learners/template">{t('Шаблон Excel')}</a>
          {groups.length === 0 ? (
            <button
              className="primary is-off"
              type="button"
              onClick={() => setError('Сначала создайте класс, затем сюда можно добавить тестируемого.')}
            >
              {t('Загрузить из Excel')}
            </button>
          ) : (
            <label className="primary file-button">
              {importing ? t('Загрузка…') : t('Загрузить из Excel')}
              <input type="file" accept=".xlsx" disabled={importing} onChange={upload} />
            </label>
          )}
        </div>
      </div>
      <Notice error={error} notice={notice} />
      {imported && (
        <section className="admin-form">
          {imported.errors?.length > 0 && (
            <details open={!imported.created}>
              <summary>{t('Пропущено строк: {count}', { count: imported.errors.length })}</summary>
              <ul className="muted">
                {imported.errors.slice(0, 50).map((line) => <li key={line}>{t(line)}</li>)}
                {imported.errors.length > 50 && <li>{t('…и ещё {count}', { count: imported.errors.length - 50 })}</li>}
              </ul>
            </details>
          )}
          {imported.learners?.length > 0 && (
            <>
              <div className="row-actions">
                <button className="ghost" type="button" onClick={downloadPasswords}>{t('Скачать логины и пароли (CSV)')}</button>
                <button className="ghost" type="button" onClick={() => setImported(null)}>{t('Скрыть')}</button>
              </div>
              <div className="table-wrap">
                <table className="mini-table">
                  <thead>
                    <tr><th>{t('Класс')}</th><th>{t('Имя')}</th><th>{t('Логин')}</th><th>{t('Пароль')}</th></tr>
                  </thead>
                  <tbody>
                    {imported.learners.map((person) => (
                      <tr key={person.id}>
                        <td>{t(person.classLabel)}</td>
                        <td>{person.displayName}</td>
                        <td>{person.login}</td>
                        <td><code>{person.password}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
      {groups.length === 0 && <p className="muted">{t('Сначала создайте класс, затем сюда можно добавить тестируемого.')}</p>}
      <p className="muted">
        {t('В файле столбцы: Класс, Имя, Логин, Пароль. Имя можно написать по-русски или по-казахски. Если пароль пустой, он будет создан автоматически и показан после загрузки.')}
      </p>
      <form className="admin-form" onSubmit={create}>
        <label>
          {t('Имя')}
          <input name="displayName" value={form.displayName} onChange={patch} />
        </label>
        <label>
          {t('Логин')}
          <input name="login" autoComplete="off" value={form.login} onChange={patch} />
        </label>
        <label>
          {t('Пароль')}
          <input name="password" type="password" autoComplete="new-password" value={form.password} onChange={patch} />
        </label>
        <label>
          {t('Класс')}
          <select name="classId" value={form.classId} onChange={patch}>
            {groups.length === 0 && <option value="">{t('Нет классов')}</option>}
            {groups.map((group) => (
              <optgroup key={group.label} label={t(group.label)}>
                {group.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <button className="primary add" type="submit" disabled={!groups.length}>{t('Создать тестируемого')}</button>
      </form>
      <div className="add-line">
        <select aria-label={t('Класс')} value={filter.classId} onChange={(event) => setFilter((current) => ({ ...current, classId: event.target.value }))}>
          <option value="">{t('Все классы')}</option>
          {groups.map((group) => (
            <optgroup key={group.label} label={t(group.label)}>
              {group.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </optgroup>
          ))}
        </select>
        <input aria-label={t('Поиск')} placeholder={t('Имя или логин')} value={searchText} onChange={(event) => setSearchText(event.target.value)} />
        <span className="muted">{learners === null ? t('Загрузка…') : t('Показано {shown} из {total}', { shown, total })}</span>
      </div>
      <div className="stack">
        {learners?.map((person) => (
          <LearnerRow key={person.id} person={person} groups={groups} onChanged={load} onDelete={() => remove(person)} onError={setError} />
        ))}
      </div>
      {learners && shown < total && (
        <button className="ghost add" type="button" onClick={() => loadPage(shown).catch((err) => setError(err.message))}>
          {t('Показать ещё')}
        </button>
      )}
    </section>
  )
}

function LearnerRow({ person, groups, onChanged, onDelete, onError }) {
  const { t } = useI18n()
  const [displayName, setDisplayName] = useState(person.displayName)
  const [classId, setClassId] = useState(person.classId)
  const [password, setPassword] = useState('')

  async function save(event) {
    event.preventDefault()
    onError('')
    try {
      await api.updateLearner(person.id, { displayName, classId, password })
      setPassword('')
      await onChanged()
    } catch (err) {
      onError(err.message)
    }
  }

  return (
    <article className="person">
      <form onSubmit={save}>
        <input aria-label={t('Имя')} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        <select aria-label={t('Класс')} value={classId} onChange={(event) => setClassId(event.target.value)}>
          {groups.map((group) => (
            <optgroup key={group.label} label={t(group.label)}>
              {group.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </optgroup>
          ))}
        </select>
        <input
          aria-label={t('Новый пароль')}
          type="password"
          autoComplete="new-password"
          placeholder={t('Новый пароль')}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button className="ghost" type="submit">{t('Сохранить')}</button>
      </form>
      <span className="muted">{person.login} · {t(person.classLabel)}</span>
      <button className="ghost" type="button" onClick={onDelete}>{t('Удалить')}</button>
    </article>
  )
}
