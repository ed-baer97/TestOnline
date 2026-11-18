import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api.js'
import { formatNumber } from '../../format.js'
import { pick, useI18n } from '../../i18n.jsx'
import { Modal, SearchBox } from '../../kit.jsx'
import { GroupChecks, Notice } from './ui.jsx'

const SCHOOL_GROUPS = { grades_1_4: true, grades_5_9: true, grades_10_11: true, students: false }

export function DistrictManager({ districts, regionId, onChanged, onError }) {
  const { lang, t } = useI18n()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [nameKk, setNameKk] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function create(event) {
    event.preventDefault()
    setError('')
    onError?.('')
    try {
      await api.createDistrict({ name, nameKk, ...(regionId ? { regionId } : {}) })
      setName('')
      setNameKk('')
      setAdding(false)
      setNotice('Район создан')
      await onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(district) {
    if (!window.confirm(t('Удалить район «{name}»?', { name: pick(lang, district.name, district.nameKk) }))) return
    onError?.('')
    try {
      await api.deleteDistrict(district.id)
      await onChanged()
    } catch (err) {
      onError?.(err.message)
    }
  }

  return (
    <div className="accordion">
      <details onToggle={(event) => event.stopPropagation()}>
        <summary>
          {t('Районы')}
          <span className="muted"> {formatNumber(districts.length)}</span>
        </summary>
        <div className="stack">
          <Notice notice={notice} />
          <button className="ghost add" type="button" onClick={() => { setError(''); setAdding(true) }}>+ {t('Добавить район')}</button>
          {districts.length === 0 && <p className="muted">{t('Районов пока нет. Нажмите «Добавить».')}</p>}
          {districts.map((district) => (
            <div className="class-line" key={district.id}>
              <span>{pick(lang, district.name, district.nameKk)}</span>
              <button className="ghost danger-btn" type="button" onClick={() => remove(district)}>{t('Удалить')}</button>
            </div>
          ))}
        </div>
      </details>
      <Modal open={adding} title={t('Создать район')} onClose={() => setAdding(false)}>
        <form className="stack" onSubmit={create}>
          <Notice error={error} />
          <label>
            {t('Название, русский')}
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('Название района')} autoFocus />
          </label>
          <label>
            {t('Название, қазақша')}
            <input value={nameKk} onChange={(event) => setNameKk(event.target.value)} placeholder="Аудан атауы" />
          </label>
          <button className="primary add" type="submit">{t('Создать район')}</button>
        </form>
      </Modal>
    </div>
  )
}

export function RegionCatalog({ regionId, onChanged }) {
  const { lang, t } = useI18n()
  const [data, setData] = useState(null)
  const [opened, setOpened] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [addingSchool, setAddingSchool] = useState(false)
  const [draft, setDraft] = useState(null)

  function load() {
    return api.catalog(regionId).then(setData)
  }

  async function refresh() {
    await load()
    await onChanged?.()
  }

  useEffect(() => {
    if (!opened) return
    let cancel = false
    api.catalog(regionId).then((catalog) => {
      if (!cancel) setData(catalog)
    }).catch((err) => {
      if (!cancel) setError(err.message)
    })
    return () => { cancel = true }
  }, [opened, regionId])

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const schools = data?.schools || []
    if (!needle) return schools
    return schools.filter((school) => `${school.name} ${school.nameKk || ''}`.toLowerCase().includes(needle))
  }, [data, query])

  const groups = useMemo(() => {
    const districts = data?.districts || []
    const buckets = districts.map((district) => ({
      district,
      schools: shown.filter((school) => school.districtId === district.id),
    }))
    const loose = shown.filter((school) => !school.districtId)
    if (loose.length) buckets.push({ district: null, schools: loose })
    const needle = query.trim()
    return needle ? buckets.filter((group) => group.schools.length) : buckets
  }, [data, shown, query])

  async function removeSchool(school) {
    if (!window.confirm(t('Удалить школу «{name}»?', { name: pick(lang, school.name, school.nameKk) }))) return
    setError('')
    setNotice('')
    try {
      await api.deleteOrganization(school.id)
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="accordion">
      <details onToggle={(event) => setOpened(event.currentTarget.open)}>
        <summary>{t('Районы и школы')}</summary>
        {opened && (
          <div className="stack">
            <p className="muted">{t('Справочник области. Записи можно добавить и удалить.')}</p>
            <Notice error={error} notice={notice} />
            {data === null && !error && <p className="muted">{t('Загрузка…')}</p>}
            {data && (
              <>
                <DistrictManager
                  districts={data.districts}
                  regionId={regionId}
                  onChanged={refresh}
                  onError={setError}
                />
                <div className="section-head">
                  <h2>{t('Школы')}</h2>
                  <button className="primary" type="button" onClick={() => { setError(''); setDraft(null); setAddingSchool(true) }}>+ {t('Добавить школу')}</button>
                </div>
                {data.schools.length > 5 && (
                  <SearchBox value={query} onChange={setQuery} placeholder="Название организации" />
                )}
                {data.schools.length === 0 && <p className="muted">{t('Школ пока нет')}</p>}
                {data.schools.length > 0 && shown.length === 0 && <p className="muted">{t('Ничего не найдено')}</p>}
                {groups.map((group) => (
                  <details key={group.district?.id || 'none'} onToggle={(event) => event.stopPropagation()} {...(query.trim() ? { open: true } : {})}>
                    <summary>
                      {group.district ? pick(lang, group.district.name, group.district.nameKk) : t('Без района')}
                      <span className="muted"> {t('{count} орг.', { count: formatNumber(group.schools.length) })}</span>
                    </summary>
                    <div className="stack">
                      {group.schools.map((school) => (
                        <div className="class-line" key={school.id}>
                          <span>{pick(lang, school.name, school.nameKk)}</span>
                          <span className="row-actions">
                            <button className="ghost" type="button" onClick={() => { setError(''); setDraft(school); setAddingSchool(true) }}>{t('Изменить')}</button>
                            <button className="ghost danger-btn" type="button" onClick={() => removeSchool(school)}>{t('Удалить')}</button>
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </>
            )}
          </div>
        )}
      </details>
      <SchoolForm
        open={addingSchool}
        regionId={regionId}
        districts={data?.districts || []}
        school={draft}
        onClose={() => setAddingSchool(false)}
        onSaved={async (created) => {
          setNotice(created ? 'Школа создана' : 'Организация сохранена')
          setAddingSchool(false)
          await refresh()
        }}
      />
    </div>
  )
}

function SchoolForm({ open, regionId, districts, school, onClose, onSaved }) {
  const { lang, t } = useI18n()
  const [name, setName] = useState('')
  const [nameKk, setNameKk] = useState('')
  const [districtId, setDistrictId] = useState('')
  const [groups, setGroups] = useState(SCHOOL_GROUPS)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setName(school?.name || '')
    setNameKk(school?.nameKk || '')
    setDistrictId(school?.districtId || '')
    setGroups(school?.groups || SCHOOL_GROUPS)
    setError('')
  }, [open, school])

  async function save(event) {
    event.preventDefault()
    setError('')
    try {
      const body = { name, nameKk, districtId, groups, regionId }
      if (school) await api.updateOrganization(school.id, body)
      else await api.createOrganization(body)
      await onSaved(!school)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Modal open={open} title={school ? t('Изменить') : t('Создать школу')} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <Notice error={error} />
        <label>
          {t('Название, русский')}
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('Школа №3')} autoFocus />
        </label>
        <label>
          {t('Название, қазақша')}
          <input value={nameKk} onChange={(event) => setNameKk(event.target.value)} placeholder="№3 мектеп" />
        </label>
        {districts.length > 0 && (
          <label>
            {t('Район')}
            <select value={districtId} onChange={(event) => setDistrictId(event.target.value)}>
              <option value="">{t('Выберите район')}</option>
              {districts.map((district) => <option key={district.id} value={district.id}>{pick(lang, district.name, district.nameKk)}</option>)}
            </select>
          </label>
        )}
        <GroupChecks groups={groups} onChange={setGroups} />
        <button className="primary add" type="submit" disabled={districts.length > 0 && !districtId}>
          {school ? t('Сохранить') : t('Создать школу')}
        </button>
      </form>
    </Modal>
  )
}
