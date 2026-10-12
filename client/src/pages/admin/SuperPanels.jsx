import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api.js'
import { formatNumber } from '../../format.js'
import { pick, useI18n } from '../../i18n.jsx'
import { Modal, SearchBox } from '../../kit.jsx'
import { Notice } from './ui.jsx'

export function Regions() {
  const { lang, t } = useI18n()
  const [regions, setRegions] = useState(null)
  const [name, setName] = useState('')
  const [nameKk, setNameKk] = useState('')
  const [drafts, setDrafts] = useState({})
  const [draftsKk, setDraftsKk] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [adding, setAdding] = useState(false)

  function load() {
    return api.regions().then((data) => {
      setRegions(data.regions)
      setDrafts(Object.fromEntries(data.regions.map((region) => [region.id, region.name])))
      setDraftsKk(Object.fromEntries(data.regions.map((region) => [region.id, region.nameKk || ''])))
    })
  }

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [])

  async function create(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      await api.createRegion({ name, nameKk })
      setName('')
      setNameKk('')
      setNotice('Регион создан')
      setAdding(false)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function rename(event, id) {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      await api.updateRegion(id, { name: drafts[id], nameKk: draftsKk[id] || '' })
      setNotice('Название сохранено')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(region) {
    if (!window.confirm(t('Удалить регион «{name}»?', { name: pick(lang, region.name, region.nameKk) }))) return
    setError('')
    setNotice('')
    try {
      await api.deleteRegion(region.id)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="stack">
      <div className="section-head">
        <div>
          <h1>{t('Регионы')}</h1>
          {regions && <p className="muted">{t('Всего: {count}', { count: formatNumber(regions.length) })}</p>}
        </div>
        <button className="primary" type="button" onClick={() => { setError(''); setNotice(''); setAdding(true) }}>+ {t('Добавить')}</button>
      </div>
      <Notice error={adding ? '' : error} notice={notice} />
      <Modal open={adding} title={t('Создать регион')} onClose={() => setAdding(false)}>
        <form className="stack" onSubmit={create}>
          <Notice error={error} />
          <label>
            {t('Название, русский')}
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('Мангыстауская область')} autoFocus />
          </label>
          <label>
            {t('Название, қазақша')}
            <input value={nameKk} onChange={(event) => setNameKk(event.target.value)} placeholder="Маңғыстау облысы" />
          </label>
          <button className="primary add" type="submit">{t('Создать регион')}</button>
        </form>
      </Modal>
      {regions === null && !error && <p className="muted">{t('Загрузка…')}</p>}
      {regions?.length === 0 && <p className="muted">{t('Регионов пока нет. Нажмите «Добавить».')}</p>}
      <div className="stack">
        {regions?.map((region) => (
          <article className="person" key={region.id}>
            <form onSubmit={(event) => rename(event, region.id)}>
              <input
                aria-label={t('Название, русский')}
                value={drafts[region.id] || ''}
                onChange={(event) => setDrafts((current) => ({ ...current, [region.id]: event.target.value }))}
              />
              <input
                aria-label={t('Название, қазақша')}
                value={draftsKk[region.id] || ''}
                onChange={(event) => setDraftsKk((current) => ({ ...current, [region.id]: event.target.value }))}
              />
              <button className="ghost" type="submit">{t('Сохранить')}</button>
            </form>
            <p className="muted">
              {t('{organizations} орг. · {admins} адм. · {learners} тест.', { organizations: region.organizations, admins: region.admins, learners: region.learners })}
            </p>
            <button className="ghost" type="button" onClick={() => remove(region)}>{t('Удалить')}</button>
          </article>
        ))}
      </div>
    </section>
  )
}

export function RegionalStaff() {
  const { lang, t } = useI18n()
  const [admins, setAdmins] = useState(null)
  const [regions, setRegions] = useState([])
  const [form, setForm] = useState({ displayName: '', login: '', password: '', regionId: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return admins || []
    const regionName = new Map(regions.map((region) => [region.id, `${region.name} ${region.nameKk || ''}`]))
    return (admins || []).filter((person) => `${person.displayName} ${person.login} ${regionName.get(person.regionId) || ''}`.toLowerCase().includes(needle))
  }, [admins, regions, query])

  function load() {
    return Promise.all([api.regionalAdmins(), api.regions()]).then(([people, regionData]) => {
      setAdmins(people.admins)
      setRegions(regionData.regions)
      setForm((current) => ({ ...current, regionId: current.regionId || regionData.regions[0]?.id || '' }))
    })
  }

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [])

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
      await api.createRegionalAdmin(form)
      setForm((current) => ({ ...current, displayName: '', login: '', password: '' }))
      setNotice(`Администратор создан. Логин: ${created.login}. Пароль: ${created.password}.`)
      setAdding(false)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(person) {
    if (!window.confirm(t('Удалить администратора {name}?', { name: person.displayName }))) return
    setError('')
    setNotice('')
    try {
      await api.deleteRegionalAdmin(person.id)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="stack">
      <div className="section-head">
        <div>
          <h1>{t('Админы областей')}</h1>
          {admins && <p className="muted">{t('Всего: {count}', { count: formatNumber(admins.length) })}</p>}
        </div>
        <button className="primary" type="button" disabled={!regions.length} onClick={() => { setError(''); setNotice(''); setAdding(true) }}>+ {t('Добавить')}</button>
      </div>
      <Notice error={adding ? '' : error} notice={notice} />
      {regions.length === 0 && admins && <p className="muted">{t('Сначала создайте регион')}</p>}
      <Modal open={adding} title={t('Создать администратора')} onClose={() => setAdding(false)}>
        <form className="stack" onSubmit={create}>
          <Notice error={error} />
          <label>
            {t('Имя')}
            <input name="displayName" value={form.displayName} onChange={patch} autoFocus />
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
            {t('Область')}
            <select name="regionId" value={form.regionId} onChange={patch}>
              {regions.length === 0 && <option value="">{t('Сначала создайте регион')}</option>}
              {regions.map((region) => <option key={region.id} value={region.id}>{pick(lang, region.name, region.nameKk)}</option>)}
            </select>
          </label>
          <button className="primary add" type="submit" disabled={!regions.length}>{t('Создать администратора')}</button>
        </form>
      </Modal>
      {admins && admins.length > 5 && (
        <div className="list-tools">
          <SearchBox value={query} onChange={setQuery} placeholder="Имя, логин или область" />
          <span className="muted">{t('Показано {shown} из {total}', { shown: formatNumber(shown.length), total: formatNumber(admins.length) })}</span>
        </div>
      )}
      {admins === null && !error && <p className="muted">{t('Загрузка…')}</p>}
      {admins?.length === 0 && <p className="muted">{t('Администраторов пока нет.')}</p>}
      {admins && admins.length > 0 && shown.length === 0 && <p className="muted">{t('Ничего не найдено')}</p>}
      <div className="stack">
        {shown.map((person) => (
          <RegionAdminRow key={person.id} person={person} regions={regions} onChanged={load} onDelete={() => remove(person)} onError={setError} />
        ))}
      </div>
    </section>
  )
}

function RegionAdminRow({ person, regions, onChanged, onDelete, onError }) {
  const { lang, t } = useI18n()
  const [displayName, setDisplayName] = useState(person.displayName)
  const [regionId, setRegionId] = useState(person.regionId)
  const [password, setPassword] = useState('')

  async function save(event) {
    event.preventDefault()
    onError('')
    try {
      await api.updateRegionalAdmin(person.id, { displayName, regionId, password })
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
        <span className="muted">{t('Логин')}: {person.login}</span>
        <select aria-label={t('Область')} value={regionId} onChange={(event) => setRegionId(event.target.value)}>
          {regions.map((region) => <option key={region.id} value={region.id}>{pick(lang, region.name, region.nameKk)}</option>)}
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
      <button className="ghost" type="button" onClick={onDelete}>{t('Удалить')}</button>
    </article>
  )
}
