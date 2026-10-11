import { useEffect, useState } from 'react'
import { api } from '../../api.js'
import { EMPTY_GROUPS, groupLabels } from '../../bands.js'
import { pick, useI18n } from '../../i18n.jsx'
import { GroupChecks, Notice } from './ui.jsx'

export function Organizations() {
  const { lang, t } = useI18n()
  const [organizations, setOrganizations] = useState(null)
  const [districts, setDistricts] = useState([])
  const [name, setName] = useState('')
  const [nameKk, setNameKk] = useState('')
  const [districtId, setDistrictId] = useState('')
  const [groups, setGroups] = useState(EMPTY_GROUPS)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState(null)

  function load() {
    return Promise.all([api.organizations(), api.districts()]).then(([orgs, area]) => {
      setOrganizations(orgs.organizations)
      setDistricts(area.districts)
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
      await api.createOrganization({ name, nameKk, districtId, groups })
      setName('')
      setNameKk('')
      setGroups(EMPTY_GROUPS)
      setNotice('Организация создана')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(org) {
    if (!window.confirm(t('Удалить организацию «{name}»? Удалятся администратор, классы и тестируемые.', { name: pick(lang, org.name, org.nameKk) }))) return
    setError('')
    setNotice('')
    try {
      await api.deleteOrganization(org.id)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="stack">
      <div className="section-head"><h1>{t('Организации')}</h1></div>
      <Notice error={error} notice={notice} />
      <form className="admin-form" onSubmit={create}>
        <label>
          {t('Название, русский')}
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('Школа №3')} />
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
        <button className="primary add" type="submit" disabled={districts.length > 0 && !districtId}>{t('Создать организацию')}</button>
      </form>
      {organizations === null && !error && <p className="muted">{t('Загрузка…')}</p>}
      <div className="stack">
        {organizations?.map((org) => (
          <article className="question-card" key={org.id}>
            <header>
              <div>
                <h2>{pick(lang, org.name, org.nameKk)}</h2>
                {districts.length > 0 && <p className="muted">{org.districtName ? pick(lang, org.districtName, org.districtNameKk) : t('Район не выбран')}</p>}
                <p className="muted">{groupLabels(org.groups, t) || t('Группы не отмечены')}</p>
                <p className="muted">{t('{orgClasses} кл. · {learners} тест. · {admins} адм.', { orgClasses: org.classes, learners: org.learners, admins: org.admins })}</p>
              </div>
              <div className="row-actions">
                <button className="ghost" type="button" onClick={() => setEditing(editing === org.id ? null : org.id)}>
                  {editing === org.id ? t('Закрыть') : t('Изменить')}
                </button>
                <button className="ghost" type="button" onClick={() => remove(org)}>{t('Удалить')}</button>
              </div>
            </header>
            {editing === org.id && (
              <OrgEditor
                org={org}
                districts={districts}
                onSaved={async () => {
                  setNotice('Организация сохранена')
                  setEditing(null)
                  await load()
                }}
                onError={setError}
              />
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

function OrgEditor({ org, districts, onSaved, onError }) {
  const { lang, t } = useI18n()
  const [name, setName] = useState(org.name)
  const [nameKk, setNameKk] = useState(org.nameKk || '')
  const [districtId, setDistrictId] = useState(org.districtId || '')
  const [groups, setGroups] = useState(org.groups)

  async function save(event) {
    event.preventDefault()
    onError('')
    try {
      await api.updateOrganization(org.id, { name, nameKk, districtId, groups })
      await onSaved()
    } catch (err) {
      onError(err.message)
    }
  }

  return (
    <form className="stack" onSubmit={save}>
      <label>
        {t('Название, русский')}
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        {t('Название, қазақша')}
        <input value={nameKk} onChange={(event) => setNameKk(event.target.value)} />
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
      <button className="primary add" type="submit">{t('Сохранить')}</button>
    </form>
  )
}

export function OrgStaff() {
  const { lang, t } = useI18n()
  const [admins, setAdmins] = useState(null)
  const [organizations, setOrganizations] = useState([])
  const [form, setForm] = useState({ displayName: '', login: '', password: '', organizationId: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function load() {
    return Promise.all([api.orgAdmins(), api.organizations()]).then(([people, orgs]) => {
      setAdmins(people.admins)
      setOrganizations(orgs.organizations)
      setForm((current) => ({
        ...current,
        organizationId: current.organizationId || orgs.organizations[0]?.id || '',
      }))
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
      await api.createOrgAdmin(form)
      setForm((current) => ({ ...current, displayName: '', login: '', password: '' }))
      setNotice(`Администратор создан. Логин: ${created.login}. Пароль: ${created.password}.`)
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
      await api.deleteOrgAdmin(person.id)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="stack">
      <div className="section-head"><h1>{t('Админы организаций')}</h1></div>
      <Notice error={error} notice={notice} />
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
          {t('Организация')}
          <select name="organizationId" value={form.organizationId} onChange={patch}>
            {organizations.length === 0 && <option value="">{t('Сначала создайте организацию')}</option>}
            {organizations.map((org) => <option key={org.id} value={org.id}>{pick(lang, org.name, org.nameKk)}</option>)}
          </select>
        </label>
        <button className="primary add" type="submit" disabled={!organizations.length}>{t('Создать администратора')}</button>
      </form>
      <div className="stack">
        {admins?.map((person) => (
          <OrgAdminRow
            key={person.id}
            person={person}
            organizations={organizations}
            onChanged={load}
            onDelete={() => remove(person)}
            onError={setError}
          />
        ))}
      </div>
    </section>
  )
}

function OrgAdminRow({ person, organizations, onChanged, onDelete, onError }) {
  const { lang, t } = useI18n()
  const [displayName, setDisplayName] = useState(person.displayName)
  const [organizationId, setOrganizationId] = useState(person.organizationId)
  const [password, setPassword] = useState('')

  async function save(event) {
    event.preventDefault()
    onError('')
    try {
      await api.updateOrgAdmin(person.id, { displayName, organizationId, password })
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
        <select aria-label={t('Организация')} value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
          {organizations.map((org) => <option key={org.id} value={org.id}>{pick(lang, org.name, org.nameKk)}</option>)}
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
