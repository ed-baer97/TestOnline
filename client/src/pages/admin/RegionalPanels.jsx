import { useEffect, useState } from 'react'
import { api } from '../../api.js'
import { EMPTY_GROUPS, groupLabels } from '../../bands.js'
import { useI18n } from '../../i18n.jsx'
import { GroupChecks, Notice } from './ui.jsx'

export function Organizations() {
  const { t } = useI18n()
  const [organizations, setOrganizations] = useState(null)
  const [name, setName] = useState('')
  const [groups, setGroups] = useState(EMPTY_GROUPS)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState(null)

  function load() {
    return api.organizations().then((data) => setOrganizations(data.organizations))
  }

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [])

  async function create(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      await api.createOrganization({ name, groups })
      setName('')
      setGroups(EMPTY_GROUPS)
      setNotice('Организация создана')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(org) {
    if (!window.confirm(t('Удалить организацию «{name}»?', { name: org.name }))) return
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
          {t('Название')}
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('Школа №3')} />
        </label>
        <GroupChecks groups={groups} onChange={setGroups} />
        <button className="primary add" type="submit">{t('Создать организацию')}</button>
      </form>
      {organizations === null && !error && <p className="muted">{t('Загрузка…')}</p>}
      <div className="stack">
        {organizations?.map((org) => (
          <article className="question-card" key={org.id}>
            <header>
              <div>
                <h2>{org.name}</h2>
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

function OrgEditor({ org, onSaved, onError }) {
  const { t } = useI18n()
  const [name, setName] = useState(org.name)
  const [groups, setGroups] = useState(org.groups)

  async function save(event) {
    event.preventDefault()
    onError('')
    try {
      await api.updateOrganization(org.id, { name, groups })
      await onSaved()
    } catch (err) {
      onError(err.message)
    }
  }

  return (
    <form className="stack" onSubmit={save}>
      <label>
        {t('Название')}
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <GroupChecks groups={groups} onChange={setGroups} />
      <button className="primary add" type="submit">{t('Сохранить')}</button>
    </form>
  )
}

export function OrgStaff() {
  const { t } = useI18n()
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
      await api.createOrgAdmin(form)
      setForm((current) => ({ ...current, displayName: '', login: '', password: '' }))
      setNotice('Администратор создан. Передайте ему логин и пароль.')
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
            {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
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
  const { t } = useI18n()
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
        <select aria-label={t('Организация')} value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
          {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
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
      <span className="muted">{person.login}</span>
      <button className="ghost" type="button" onClick={onDelete}>{t('Удалить')}</button>
    </article>
  )
}
