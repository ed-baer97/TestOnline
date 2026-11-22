import { useState } from 'react'
import { Notice } from '../../components/admin/ui.jsx'
import { useLearners } from '../../state/admin/learners.js'
import { useClassTree } from '../../state/admin/structure.js'
import { pick, useI18n } from '../../state/i18n.jsx'

export function Classes() {
  const { t } = useI18n()
  const { tree, error, notice, trackName, setTrackName, run, addTrack, actions } = useClassTree()

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
                    <ClassLine key={item.id} item={item} actions={actions} onRun={run} />
                  ))}
                  <AddLine placeholder={`${grade.grade}а`} onAdd={(name) => actions.createClass({ grade: grade.grade, name })} onRun={run} />
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
                    <TrackName track={track} actions={actions} onRun={run} />
                    {track.classes.map((item) => (
                      <ClassLine key={item.id} item={item} actions={actions} onRun={run} />
                    ))}
                    <AddLine placeholder="ИС-21" onAdd={(name) => actions.createClass({ trackId: track.id, name })} onRun={run} />
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

function ClassLine({ item, actions, onRun }) {
  const { t } = useI18n()
  const [name, setName] = useState(item.name)

  return (
    <div className="class-line">
      <form
        className="add-line"
        onSubmit={(event) => {
          event.preventDefault()
          onRun(() => actions.updateClass(item.id, { name }))
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
          if (window.confirm(t('Удалить «{name}»?', { name: item.name }))) onRun(() => actions.deleteClass(item.id))
        }}
      >
        {t('Удалить')}
      </button>
    </div>
  )
}

function TrackName({ track, actions, onRun }) {
  const { t } = useI18n()
  const [name, setName] = useState(track.name)

  return (
    <form
      className="add-line"
      onSubmit={(event) => {
        event.preventDefault()
        onRun(() => actions.updateTrack(track.id, { name }))
      }}
    >
      <input aria-label={t('Название курса')} value={name} onChange={(event) => setName(event.target.value)} />
      <button className="ghost" type="submit">{t('Переименовать')}</button>
      <button
        className="ghost"
        type="button"
        onClick={() => {
          if (window.confirm(t('Удалить курс «{name}»?', { name: track.name }))) onRun(() => actions.deleteTrack(track.id))
        }}
      >
        {t('Удалить курс')}
      </button>
    </form>
  )
}

function ClassOptGroups({ groups, t }) {
  return groups.map((group) => (
    <optgroup key={group.label} label={t(group.label)}>
      {group.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </optgroup>
  ))
}

function QuickClassCreator({ tree, groups, onCreateTrack, onCreateClass, onError }) {
  const { t } = useI18n()
  const schoolGrades = (tree?.sections || [])
    .filter((section) => section.kind === 'school')
    .flatMap((section) => section.grades)
  const studentSection = (tree?.sections || []).find((section) => section.kind === 'students') || null
  const [grade, setGrade] = useState('')
  const [className, setClassName] = useState('')
  const [trackName, setTrackName] = useState('')
  const [trackId, setTrackId] = useState('')
  const [groupName, setGroupName] = useState('')

  const effectiveGrade = schoolGrades.some((item) => String(item.grade) === String(grade))
    ? grade
    : (schoolGrades[0]?.grade ?? '')
  const tracks = studentSection?.tracks || []
  const effectiveTrackId = tracks.some((item) => item.id === trackId)
    ? trackId
    : (tracks[0]?.id || '')

  async function addSchoolClass(event) {
    event.preventDefault()
    onError('')
    try {
      await onCreateClass({ grade: Number(effectiveGrade), name: className })
      setClassName('')
    } catch (err) {
      onError(err.message)
    }
  }

  async function addTrack(event) {
    event.preventDefault()
    onError('')
    try {
      const created = await onCreateTrack(trackName)
      setTrackName('')
      setTrackId(created.id)
    } catch (err) {
      onError(err.message)
    }
  }

  async function addGroup(event) {
    event.preventDefault()
    onError('')
    try {
      await onCreateClass({ trackId: effectiveTrackId, name: groupName })
      setGroupName('')
    } catch (err) {
      onError(err.message)
    }
  }

  if (!schoolGrades.length && !studentSection) return null

  return (
    <div className="accordion">
      <details key={`${tree.organization.id}-${groups.length === 0}`} open={groups.length === 0}>
        <summary>{t('Добавить класс или группу')}</summary>
        <div className="stack">
          {schoolGrades.length > 0 && (
            <form className="add-line" onSubmit={addSchoolClass}>
              <select aria-label={t('Школьный класс')} value={effectiveGrade} onChange={(event) => setGrade(event.target.value)}>
                {schoolGrades.map((item) => <option key={item.grade} value={item.grade}>{t(item.label)}</option>)}
              </select>
              <input
                aria-label={t('Класс')}
                value={className}
                onChange={(event) => setClassName(event.target.value)}
                placeholder={effectiveGrade ? `${effectiveGrade}а` : '5а'}
              />
              <button className="ghost" type="submit">{t('Добавить класс')}</button>
            </form>
          )}
          {studentSection && (
            <>
              <form className="add-line" onSubmit={addTrack}>
                <input
                  aria-label={t('Название курса')}
                  value={trackName}
                  onChange={(event) => setTrackName(event.target.value)}
                  placeholder={t('1 курс')}
                />
                <button className="ghost" type="submit">{t('Добавить курс')}</button>
              </form>
              {tracks.length > 0 && (
                <form className="add-line" onSubmit={addGroup}>
                  <select aria-label={t('Название курса')} value={effectiveTrackId} onChange={(event) => setTrackId(event.target.value)}>
                    {tracks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                  <input
                    aria-label={t('Группа студентов')}
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                    placeholder="ИС-21"
                  />
                  <button className="ghost" type="submit">{t('Добавить группу')}</button>
                </form>
              )}
            </>
          )}
        </div>
      </details>
    </div>
  )
}

function countNonEmptyLines(text) {
  return String(text || '').split(/\r?\n/).filter((line) => line.trim()).length
}

function safeCsvCell(value) {
  const raw = String(value ?? '')
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw
  return `"${safe.replace(/"/g, '""')}"`
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function Learners({ isSuper = false }) {
  const { lang, t } = useI18n()
  const {
    targetsLoaded,
    regions,
    organizations,
    regionId,
    changeRegion,
    organizationId,
    changeOrganization,
    selectedOrganization,
    tree,
    learners,
    total,
    groups,
    filter,
    setFilter,
    searchText,
    setSearchText,
    form,
    bulkMode,
    setBulkMode,
    bulkClassId,
    setBulkClassId,
    fioText,
    setFioText,
    error,
    setError,
    notice,
    imported,
    setImported,
    importing,
    loadPage,
    load,
    patch,
    quickCreateTrack,
    quickCreateClass,
    create,
    remove,
    registerList,
    upload,
    exportExcel,
    saveLearner,
  } = useLearners(isSuper)
  const [exporting, setExporting] = useState(false)

  const orgLabel = selectedOrganization ? pick(lang, selectedOrganization.name, selectedOrganization.nameKk) : ''
  const lineCount = countNonEmptyLines(fioText)
  const useFioTemplate = Boolean(bulkClassId)
  const templateHref = useFioTemplate ? '/api/admin/learners/template?mode=fio' : '/api/admin/learners/template'
  const showOrgContent = !isSuper || Boolean(organizationId)

  function confirmRemove(person) {
    if (window.confirm(t('Удалить {name}?', { name: person.displayName }))) remove(person)
  }

  function downloadPasswordsCsv() {
    if (!imported?.learners?.length) return
    const hasOrg = Boolean(imported.organizationName)
    const header = [
      ...(hasOrg ? [t('Организация')] : []),
      t('Класс'),
      t('ФИО'),
      t('Логин'),
      t('Пароль'),
    ]
    const lines = [header.map(safeCsvCell).join(';')]
    for (const person of imported.learners) {
      const cells = [
        ...(hasOrg ? [imported.organizationName] : []),
        t(person.classLabel),
        person.displayName,
        person.login,
        person.password,
      ]
      lines.push(cells.map(safeCsvCell).join(';'))
    }
    const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
    triggerDownload(blob, 'paroli-testiruemyh.csv')
  }

  async function downloadPasswordsExcel() {
    if (!imported?.learners?.length) return
    setError('')
    setExporting(true)
    try {
      const blob = await exportExcel(lang, t)
      if (blob) triggerDownload(blob, 'paroli-testiruemyh.xlsx')
    } catch (err) {
      setError(err.message)
    } finally {
      setExporting(false)
    }
  }

  const shown = learners?.length || 0

  return (
    <section className="stack">
      <div className="section-head">
        <h1>{t('Тестируемые')}</h1>
      </div>
      <Notice error={error} notice={notice} />
      {isSuper && (
        <section className="admin-form">
          <div className="scope-grid">
            <label>
              {t('Регион')}
              <select value={regionId} onChange={(event) => changeRegion(event.target.value)} disabled={!regions.length}>
                {!regions.length && <option value="">{t('Нет регионов')}</option>}
                {regions.map((region) => (
                  <option key={region.id} value={region.id}>{pick(lang, region.name, region.nameKk)}</option>
                ))}
              </select>
            </label>
            <label>
              {t('Организация')}
              <select value={organizationId} onChange={(event) => changeOrganization(event.target.value)} disabled={!organizations.length}>
                {!organizations.length && <option value="">{t('Нет организаций')}</option>}
                {organizations.map((org) => {
                  const name = pick(lang, org.name, org.nameKk)
                  const district = org.districtName ? pick(lang, org.districtName, org.districtNameKk) : ''
                  return <option key={org.id} value={org.id}>{district ? `${name} (${district})` : name}</option>
                })}
              </select>
            </label>
          </div>
          {!targetsLoaded && <p className="muted">{t('Загрузка…')}</p>}
          {targetsLoaded && regions.length === 0 && <p className="muted">{t('Сначала создайте регион в разделе «Регионы».')}</p>}
          {targetsLoaded && regions.length > 0 && organizations.length === 0 && <p className="muted">{t('В этом регионе пока нет организаций.')}</p>}
        </section>
      )}
      {isSuper && organizationId && tree && (
        <QuickClassCreator
          tree={tree}
          groups={groups}
          onCreateTrack={quickCreateTrack}
          onCreateClass={quickCreateClass}
          onError={setError}
        />
      )}
      {showOrgContent && (
        <>
          {!isSuper && groups.length === 0 && <p className="muted">{t('Сначала создайте класс, затем сюда можно добавить тестируемого.')}</p>}
          <section className="admin-form">
            <div className="form-card-head">
              <h2>{t('Регистрация списком')}</h2>
              <div className="mode-tabs">
                <button className={bulkMode === 'list' ? 'primary' : 'ghost'} type="button" onClick={() => setBulkMode('list')}>
                  {t('Список ФИО')}
                </button>
                <button className={bulkMode === 'excel' ? 'primary' : 'ghost'} type="button" onClick={() => setBulkMode('excel')}>
                  {t('Файл Excel (.xlsx)')}
                </button>
              </div>
            </div>
            <label>
              {t('Класс для списка')}
              <select
                value={bulkClassId ?? ''}
                onChange={(event) => setBulkClassId(event.target.value)}
                disabled={bulkMode === 'list' && !groups.length}
              >
                {bulkMode === 'excel' && <option value="">{t('По столбцу «Класс» в файле')}</option>}
                {bulkMode === 'list' && !groups.length && <option value="">{t('Нет классов')}</option>}
                <ClassOptGroups groups={groups} t={t} />
              </select>
            </label>
            {bulkMode === 'list' ? (
              <form className="stack" onSubmit={(event) => registerList(event, orgLabel)}>
                <label>
                  {t('ФИО')}
                  <textarea
                    rows={7}
                    value={fioText}
                    onChange={(event) => setFioText(event.target.value)}
                    placeholder={'Иванов Иван Иванович\nПетрова Анна Сергеевна\nҚасымова Аида Серікқызы'}
                  />
                </label>
                <p className="muted">
                  {t('По одному ФИО на строку. Логин и пароль сгенерируются автоматически. Можно вставить список из Word, Excel или мессенджера.')}
                </p>
                <div className="row-actions">
                  <button className="primary" type="submit" disabled={importing || !groups.length || !bulkClassId || !lineCount}>
                    {importing ? t('Регистрация…') : t('Зарегистрировать список')}
                  </button>
                  <span className="muted">{t('Строк в списке: {count}', { count: lineCount })}</span>
                </div>
              </form>
            ) : (
              <div className="stack">
                <p className="muted">
                  {useFioTemplate
                    ? t('В файле достаточно одного столбца «ФИО» (или столбцы «Фамилия», «Имя», «Отчество»). Логин и пароль сгенерируются автоматически. Столбец «Класс» — по желанию.')
                    : t('В файле укажите столбцы «Класс» и «ФИО» (или «Класс», «Имя», «Логин», «Пароль»). Пустые логин и пароль сгенерируются автоматически.')}
                </p>
                <div className="row-actions">
                  <a className="ghost" href={templateHref}>{t(useFioTemplate ? 'Шаблон Excel (ФИО)' : 'Шаблон Excel')}</a>
                  <label className={`primary file-button${importing || !groups.length ? ' disabled' : ''}`}>
                    {importing ? t('Загрузка…') : t('Загрузить из Excel')}
                    <input className="sr-only" type="file" accept=".xlsx" disabled={importing || !groups.length} onChange={(event) => upload(event, orgLabel)} />
                  </label>
                </div>
              </div>
            )}
          </section>
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
                    <button className="excel" type="button" disabled={exporting} onClick={downloadPasswordsExcel}>{t('Скачать Excel (.xlsx)')}</button>
                    <button className="ghost" type="button" onClick={downloadPasswordsCsv}>{t('Скачать CSV')}</button>
                    <button className="ghost" type="button" onClick={() => setImported(null)}>{t('Скрыть')}</button>
                  </div>
                  <div className="table-wrap">
                    <table className="mini-table">
                      <thead>
                        <tr><th>{t('Класс')}</th><th>{t('ФИО')}</th><th>{t('Логин')}</th><th>{t('Пароль')}</th></tr>
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
          <form className="admin-form" onSubmit={create}>
            <label>
              {t('ФИО')}
              <input name="displayName" value={form.displayName} onChange={patch} />
            </label>
            <label>
              {t('Логин')}
              <input
                name="login"
                autoComplete="off"
                placeholder={t('Автоматически')}
                title={t('3–32 символа латиницей: буквы, цифры, точка, _ или -')}
                value={form.login}
                onChange={patch}
              />
            </label>
            <label>
              {t('Пароль')}
              <input name="password" type="password" autoComplete="new-password" placeholder={t('Автоматически')} value={form.password} onChange={patch} />
            </label>
            <label>
              {t('Класс')}
              <select name="classId" value={form.classId} onChange={patch}>
                {groups.length === 0 && <option value="">{t('Нет классов')}</option>}
                <ClassOptGroups groups={groups} t={t} />
              </select>
            </label>
            <button className="primary add" type="submit" disabled={!groups.length}>{t('Создать тестируемого')}</button>
          </form>
          <div className="add-line">
            <select aria-label={t('Класс')} value={filter.classId} onChange={(event) => setFilter((current) => ({ ...current, classId: event.target.value }))}>
              <option value="">{t('Все классы')}</option>
              <ClassOptGroups groups={groups} t={t} />
            </select>
            <input aria-label={t('Поиск')} placeholder={t('Имя или логин')} value={searchText} onChange={(event) => setSearchText(event.target.value)} />
            <span className="muted">{learners === null ? t('Загрузка…') : t('Показано {shown} из {total}', { shown, total })}</span>
          </div>
          <div className="stack">
            {learners?.map((person) => (
              <LearnerRow key={person.id} person={person} groups={groups} onSave={(body) => saveLearner(person.id, body)} onChanged={load} onDelete={() => confirmRemove(person)} onError={setError} />
            ))}
          </div>
          {learners && shown < total && (
            <button className="ghost add" type="button" onClick={() => loadPage(shown).catch((err) => setError(err.message))}>
              {t('Показать ещё')}
            </button>
          )}
        </>
      )}
    </section>
  )
}

function LearnerRow({ person, groups, onSave, onChanged, onDelete, onError }) {
  const { t } = useI18n()
  const [displayName, setDisplayName] = useState(person.displayName)
  const [classId, setClassId] = useState(person.classId)
  const [password, setPassword] = useState('')

  async function save(event) {
    event.preventDefault()
    onError('')
    try {
      await onSave({ displayName, classId, password })
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
          <ClassOptGroups groups={groups} t={t} />
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
