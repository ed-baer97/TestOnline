import { useEffect, useState } from 'react'
import { api } from '../../api.js'
import { Notice } from './ui.jsx'

export function Regions() {
  const [regions, setRegions] = useState(null)
  const [name, setName] = useState('')
  const [drafts, setDrafts] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function load() {
    return api.regions().then((data) => {
      setRegions(data.regions)
      setDrafts(Object.fromEntries(data.regions.map((region) => [region.id, region.name])))
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
      await api.createRegion({ name })
      setName('')
      setNotice('Регион создан')
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
      await api.updateRegion(id, { name: drafts[id] })
      setNotice('Название сохранено')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(region) {
    if (!window.confirm(`Удалить регион «${region.name}»?`)) return
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
      <div className="section-head"><h1>Регионы</h1></div>
      <Notice error={error} notice={notice} />
      <form className="admin-form" onSubmit={create}>
        <label>
          Новый регион
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Мангыстауская область" />
        </label>
        <button className="primary add" type="submit">Создать регион</button>
      </form>
      {regions === null && !error && <p className="muted">Загрузка…</p>}
      <div className="stack">
        {regions?.map((region) => (
          <article className="person" key={region.id}>
            <form onSubmit={(event) => rename(event, region.id)}>
              <input
                aria-label={`Название ${region.name}`}
                value={drafts[region.id] || ''}
                onChange={(event) => setDrafts((current) => ({ ...current, [region.id]: event.target.value }))}
              />
              <button className="ghost" type="submit">Сохранить</button>
            </form>
            <p className="muted">
              {region.organizations} орг. · {region.admins} адм. · {region.learners} тест.
            </p>
            <button className="ghost" type="button" onClick={() => remove(region)}>Удалить</button>
          </article>
        ))}
      </div>
    </section>
  )
}

export function RegionalStaff() {
  const [admins, setAdmins] = useState(null)
  const [regions, setRegions] = useState([])
  const [form, setForm] = useState({ displayName: '', login: '', password: '', regionId: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

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
      await api.createRegionalAdmin(form)
      setForm((current) => ({ ...current, displayName: '', login: '', password: '' }))
      setNotice('Администратор создан. Передайте ему логин и пароль.')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(person) {
    if (!window.confirm(`Удалить администратора ${person.displayName}?`)) return
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
      <div className="section-head"><h1>Админы областей</h1></div>
      <Notice error={error} notice={notice} />
      <form className="admin-form" onSubmit={create}>
        <label>
          Имя
          <input name="displayName" value={form.displayName} onChange={patch} />
        </label>
        <label>
          Логин
          <input name="login" autoComplete="off" value={form.login} onChange={patch} />
        </label>
        <label>
          Пароль
          <input name="password" type="password" autoComplete="new-password" value={form.password} onChange={patch} />
        </label>
        <label>
          Регион
          <select name="regionId" value={form.regionId} onChange={patch}>
            {regions.length === 0 && <option value="">Сначала создайте регион</option>}
            {regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
          </select>
        </label>
        <button className="primary add" type="submit" disabled={!regions.length}>Создать администратора</button>
      </form>
      <div className="stack">
        {admins?.map((person) => (
          <RegionAdminRow key={person.id} person={person} regions={regions} onChanged={load} onDelete={() => remove(person)} onError={setError} />
        ))}
      </div>
    </section>
  )
}

function RegionAdminRow({ person, regions, onChanged, onDelete, onError }) {
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
        <input aria-label="Имя" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        <select aria-label="Регион" value={regionId} onChange={(event) => setRegionId(event.target.value)}>
          {regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
        </select>
        <input
          aria-label="Новый пароль"
          type="password"
          autoComplete="new-password"
          placeholder="Новый пароль"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button className="ghost" type="submit">Сохранить</button>
      </form>
      <span className="muted">{person.login}</span>
      <button className="ghost" type="button" onClick={onDelete}>Удалить</button>
    </article>
  )
}
