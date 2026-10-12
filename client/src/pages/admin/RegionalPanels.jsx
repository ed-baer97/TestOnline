import { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { api } from '../../api.js'
import { EMPTY_GROUPS, groupLabels } from '../../bands.js'
import { formatNumber } from '../../format.js'
import { pick, useI18n } from '../../i18n.jsx'
import { Modal, SearchBox } from '../../kit.jsx'
import { GroupChecks, Notice } from './ui.jsx'

const ORG_PAGE = 50

function districtLabel(district, lang, t) {
  if (!district) return t('Без района')
  return pick(lang, district.name, district.nameKk)
}

function groupOrgsByDistrict(organizations, districts) {
  const order = new Map(districts.map((district, index) => [district.id, index]))
  const buckets = new Map()
  for (const org of organizations) {
    const key = org.districtId || ''
    if (!buckets.has(key)) {
      buckets.set(key, {
        key: key || 'none',
        district: districts.find((district) => district.id === key) || null,
        organizations: [],
      })
    }
    buckets.get(key).organizations.push(org)
  }
  return [...buckets.values()].sort((left, right) => {
    if (!left.district) return 1
    if (!right.district) return -1
    return (order.get(left.district.id) ?? 0) - (order.get(right.district.id) ?? 0)
  })
}

function groupedSelect(organizations, districts, lang, t) {
  const groups = groupOrgsByDistrict(organizations, districts)
  if (!districts.length) {
    return organizations.map((org) => <option key={org.id} value={org.id}>{pick(lang, org.name, org.nameKk)}</option>)
  }
  return groups.map((group) => (
    <optgroup key={group.key} label={districtLabel(group.district, lang, t)}>
      {group.organizations.map((org) => <option key={org.id} value={org.id}>{pick(lang, org.name, org.nameKk)}</option>)}
    </optgroup>
  ))
}

function DistrictAccordion({ groups, lang, t, query, children }) {
  const searching = Boolean(query?.trim())
  return (
    <div className="accordion">
      {groups.map((group) => (
        <details key={group.key} {...(searching ? { open: true } : {})}>
          <summary>
            {districtLabel(group.district, lang, t)}
            <span className="muted"> {t('{count} орг.', { count: formatNumber(group.organizations.length) })}</span>
          </summary>
          <div className="stack">{children(group)}</div>
        </details>
      ))}
    </div>
  )
}

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
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(ORG_PAGE)
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (organizations || []).filter((org) => {
      if (!needle) return true
      return `${org.name} ${org.nameKk || ''} ${org.districtName || ''} ${org.districtNameKk || ''}`.toLowerCase().includes(needle)
    })
  }, [organizations, query])
  const grouped = useMemo(() => groupOrgsByDistrict(shown, districts), [shown, districts])

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
      setAdding(false)
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
      <div className="section-head">
        <div>
          <h1>{t('Организации')}</h1>
          {organizations && <p className="muted">{t('Всего: {count}', { count: formatNumber(organizations.length) })}</p>}
        </div>
        <button className="primary" type="button" onClick={() => { setError(''); setNotice(''); setAdding(true) }}>+ {t('Добавить')}</button>
      </div>
      <Notice error={adding ? '' : error} notice={notice} />
      <Modal open={adding} title={t('Создать организацию')} onClose={() => setAdding(false)}>
        <form className="stack" onSubmit={create}>
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
          <button className="primary add" type="submit" disabled={districts.length > 0 && !districtId}>{t('Создать организацию')}</button>
        </form>
      </Modal>
      {organizations && organizations.length > 5 && (
        <div className="list-tools">
          <SearchBox value={query} onChange={(value) => { setQuery(value); setLimit(ORG_PAGE) }} placeholder="Название организации" />
          <span className="muted">{t('Показано {shown} из {total}', { shown: formatNumber(shown.length), total: formatNumber(organizations.length) })}</span>
        </div>
      )}
      {organizations === null && !error && <p className="muted">{t('Загрузка…')}</p>}
      {organizations?.length === 0 && <p className="muted">{t('Организаций пока нет. Нажмите «Добавить».')}</p>}
      {organizations && organizations.length > 0 && shown.length === 0 && <p className="muted">{t('Ничего не найдено')}</p>}
      {districts.length > 0 ? (
        <DistrictAccordion groups={grouped} lang={lang} t={t} query={query}>
          {(group) => group.organizations.map((org) => (
            <OrgCard
              key={org.id}
              org={org}
              districts={districts}
              editing={editing === org.id}
              onToggle={() => setEditing(editing === org.id ? null : org.id)}
              onRemove={() => remove(org)}
              onSaved={async () => {
                setNotice('Организация сохранена')
                setEditing(null)
                await load()
              }}
              onError={setError}
            />
          ))}
        </DistrictAccordion>
      ) : (
        <>
          <div className="stack">
            {shown.slice(0, limit).map((org) => (
              <OrgCard
                key={org.id}
                org={org}
                districts={districts}
                editing={editing === org.id}
                onToggle={() => setEditing(editing === org.id ? null : org.id)}
                onRemove={() => remove(org)}
                onSaved={async () => {
                  setNotice('Организация сохранена')
                  setEditing(null)
                  await load()
                }}
                onError={setError}
              />
            ))}
          </div>
          {shown.length > limit && (
            <button className="ghost add" type="button" onClick={() => setLimit((value) => value + ORG_PAGE)}>{t('Показать ещё')}</button>
          )}
        </>
      )}
    </section>
  )
}

function OrgCard({ org, districts, editing, onToggle, onRemove, onSaved, onError }) {
  const { lang, t } = useI18n()
  return (
    <article className="question-card">
      <header>
        <div>
          <h2>{pick(lang, org.name, org.nameKk)}</h2>
          {districts.length === 0 && org.districtName && <p className="muted">{pick(lang, org.districtName, org.districtNameKk)}</p>}
          <p className="muted">{groupLabels(org.groups, t) || t('Группы не отмечены')}</p>
          <p className="muted">{t('{orgClasses} кл. · {learners} тест. · {admins} адм.', { orgClasses: org.classes, learners: org.learners, admins: org.admins })}</p>
        </div>
        <div className="row-actions">
          <NavLink className="ghost" to={`/admin/stats/organizations/${org.id}`}>{t('Статистика')}</NavLink>
          <button className="ghost" type="button" onClick={onToggle}>
            {editing ? t('Закрыть') : t('Изменить')}
          </button>
          <button className="ghost" type="button" onClick={onRemove}>{t('Удалить')}</button>
        </div>
      </header>
      {editing && (
        <OrgEditor org={org} districts={districts} onSaved={onSaved} onError={onError} />
      )}
    </article>
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
  const [districts, setDistricts] = useState([])
  const [form, setForm] = useState({ displayName: '', login: '', password: '', organizationId: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(ORG_PAGE)
  const shownOrgs = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const people = admins || []
    return organizations.filter((org) => {
      if (!needle) return true
      const district = `${org.districtName || ''} ${org.districtNameKk || ''}`
      if (`${org.name} ${org.nameKk || ''} ${district}`.toLowerCase().includes(needle)) return true
      return people.some((person) => person.organizationId === org.id && `${person.displayName} ${person.login}`.toLowerCase().includes(needle))
    })
  }, [admins, organizations, query])
  const grouped = useMemo(() => groupOrgsByDistrict(shownOrgs, districts), [shownOrgs, districts])
  const shownAdmins = useMemo(() => {
    const allowed = new Set(shownOrgs.map((org) => org.id))
    return (admins || []).filter((person) => allowed.has(person.organizationId))
  }, [admins, shownOrgs])

  function load() {
    return Promise.all([api.orgAdmins(), api.organizations(), api.districts()]).then(([people, orgs, area]) => {
      setAdmins(people.admins)
      setOrganizations(orgs.organizations)
      setDistricts(area.districts)
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
      await api.deleteOrgAdmin(person.id)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="stack">
      <div className="section-head">
        <div>
          <h1>{t('Админы организаций')}</h1>
          {admins && <p className="muted">{t('Всего: {count}', { count: formatNumber(admins.length) })}</p>}
        </div>
        <button className="primary" type="button" disabled={!organizations.length} onClick={() => { setError(''); setNotice(''); setAdding(true) }}>+ {t('Добавить')}</button>
      </div>
      <Notice error={adding ? '' : error} notice={notice} />
      {organizations.length === 0 && admins && <p className="muted">{t('Сначала создайте организацию')}</p>}
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
            {t('Организация')}
            <select name="organizationId" value={form.organizationId} onChange={patch}>
              {organizations.length === 0 && <option value="">{t('Сначала создайте организацию')}</option>}
              {groupedSelect(organizations, districts, lang, t)}
            </select>
          </label>
          <button className="primary add" type="submit" disabled={!organizations.length}>{t('Создать администратора')}</button>
        </form>
      </Modal>
      {admins && (admins.length > 5 || organizations.length > 5) && (
        <div className="list-tools">
          <SearchBox value={query} onChange={(value) => { setQuery(value); setLimit(ORG_PAGE) }} placeholder="Имя, логин или организация" />
          <span className="muted">{t('Показано {shown} из {total}', { shown: formatNumber(shownAdmins.length), total: formatNumber(admins.length) })}</span>
        </div>
      )}
      {admins === null && !error && <p className="muted">{t('Загрузка…')}</p>}
      {organizations.length > 0 && admins?.length === 0 && districts.length === 0 && <p className="muted">{t('Администраторов пока нет.')}</p>}
      {admins && organizations.length > 0 && shownOrgs.length === 0 && <p className="muted">{t('Ничего не найдено')}</p>}
      {districts.length > 0 ? (
        <DistrictAccordion groups={grouped} lang={lang} t={t} query={query}>
          {(group) => group.organizations.map((org) => (
            <OrgAdminGroup
              key={org.id}
              org={org}
              people={(admins || []).filter((person) => person.organizationId === org.id)}
              organizations={organizations}
              districts={districts}
              onChanged={load}
              onDelete={remove}
              onError={setError}
            />
          ))}
        </DistrictAccordion>
      ) : (
        <>
          <div className="stack">
            {shownAdmins.slice(0, limit).map((person) => (
              <OrgAdminRow
                key={person.id}
                person={person}
                organizations={organizations}
                districts={districts}
                onChanged={load}
                onDelete={() => remove(person)}
                onError={setError}
              />
            ))}
          </div>
          {shownAdmins.length > limit && (
            <button className="ghost add" type="button" onClick={() => setLimit((value) => value + ORG_PAGE)}>{t('Показать ещё')}</button>
          )}
        </>
      )}
    </section>
  )
}

function OrgAdminGroup({ org, people, organizations, districts, onChanged, onDelete, onError }) {
  const { lang, t } = useI18n()
  return (
    <div className="org-group">
      <h2>{pick(lang, org.name, org.nameKk)}</h2>
      {people.length === 0 && <p className="muted">{t('Нет администратора')}</p>}
      {people.map((person) => (
        <OrgAdminRow
          key={person.id}
          person={person}
          organizations={organizations}
          districts={districts}
          onChanged={onChanged}
          onDelete={() => onDelete(person)}
          onError={onError}
        />
      ))}
    </div>
  )
}

function OrgAdminRow({ person, organizations, districts = [], onChanged, onDelete, onError }) {
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
          {groupedSelect(organizations, districts, lang, t)}
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
