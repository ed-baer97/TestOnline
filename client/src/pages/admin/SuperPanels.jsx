import { useState } from 'react'
import { Notice } from '../../components/admin/ui.jsx'
import { useRegionalStaff, useRegions } from '../../state/admin/regions.js'

export function Regions() {
  const { regions, name, setName, drafts, setDrafts, error, notice, create, rename, remove } = useRegions()

  function confirmRemove(region) {
    if (window.confirm(`Удалить регион «${region.name}»?`)) remove(region)
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
            <button className="ghost" type="button" onClick={() => confirmRemove(region)}>Удалить</button>
          </article>
        ))}
      </div>
    </section>
  )
}

export function RegionalStaff() {
  const { admins, regions, form, error, setError, notice, load, patch, create, remove, saveAdmin } = useRegionalStaff()

  function confirmRemove(person) {
    if (window.confirm(`Удалить администратора ${person.displayName}?`)) remove(person)
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
          <input name="login" autoComplete="off" placeholder="admin.region" title="3–32 символа латиницей: буквы, цифры, точка, _ или -" value={form.login} onChange={patch} />
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
          <RegionAdminRow key={person.id} person={person} regions={regions} onSave={(body) => saveAdmin(person.id, body)} onChanged={load} onDelete={() => confirmRemove(person)} onError={setError} />
        ))}
      </div>
    </section>
  )
}

function RegionAdminRow({ person, regions, onSave, onChanged, onDelete, onError }) {
  const [displayName, setDisplayName] = useState(person.displayName)
  const [regionId, setRegionId] = useState(person.regionId)
  const [password, setPassword] = useState('')

  async function save(event) {
    event.preventDefault()
    onError('')
    try {
      await onSave({ displayName, regionId, password })
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
