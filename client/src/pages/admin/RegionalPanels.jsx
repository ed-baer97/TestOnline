import { useState } from 'react'
import { GroupChecks, Notice } from '../../components/admin/ui.jsx'
import { groupLabels } from '../../lib/bands.js'
import { useOrganizations, useOrgStaff } from '../../state/admin/organizations.js'
import { pick, useI18n } from '../../state/i18n.jsx'

export function Organizations({ me }) {
  const { lang, t } = useI18n()
  const {
    organizations,
    districts,
    name,
    setName,
    nameKk,
    setNameKk,
    districtId,
    setDistrictId,
    districtName,
    setDistrictName,
    districtNameKk,
    setDistrictNameKk,
    groups,
    setGroups,
    error,
    setError,
    notice,
    editing,
    setEditing,
    create,
    remove,
    addDistrict,
    removeDistrict,
    seedCatalog,
    saveOrganization,
    organizationSaved,
  } = useOrganizations()

  const canSeedMangystau = /манг[ыи]стау|маңғыстау/i.test(me?.regionName || '')

  function confirmRemove(org) {
    if (window.confirm(t('Удалить организацию «{name}»?', { name: pick(lang, org.name, org.nameKk) }))) remove(org)
  }

  return (
    <section className="stack">
      <div className="section-head"><h1>{t('Организации')}</h1></div>
      <Notice error={error} notice={notice} />
      {canSeedMangystau && (
        <div className="row-actions">
          <button className="ghost" type="button" onClick={seedCatalog}>{t('Загрузить районы и школы Мангистау')}</button>
        </div>
      )}
      <form className="admin-form" onSubmit={addDistrict}>
        <label>
          {t('Район')}
          <input value={districtName} onChange={(event) => setDistrictName(event.target.value)} placeholder={t('Бейнеуский район')} />
        </label>
        <label>
          {t('Район, қазақша')}
          <input value={districtNameKk} onChange={(event) => setDistrictNameKk(event.target.value)} placeholder="Бейнеу ауданы" />
        </label>
        <button className="ghost add" type="submit">{t('Добавить район')}</button>
      </form>
      {districts.length > 0 && (
        <div className="stack">
          {districts.map((district) => {
            const label = pick(lang, district.name, district.nameKk)
            return (
              <div className="class-line" key={district.id}>
                <span>{label}</span>
                <button className="ghost" type="button" onClick={() => { if (window.confirm(t('Удалить район «{name}»?', { name: label }))) removeDistrict(district) }}>{t('Удалить')}</button>
              </div>
            )
          })}
        </div>
      )}
      <form className="admin-form" onSubmit={create}>
        <label>
          {t('Название')}
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
              {districts.map((district) => (
                <option key={district.id} value={district.id}>{pick(lang, district.name, district.nameKk)}</option>
              ))}
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
                {org.districtName && <p className="muted">{pick(lang, org.districtName, org.districtNameKk)}</p>}
                <p className="muted">{groupLabels(org.groups, t) || t('Группы не отмечены')}</p>
                <p className="muted">
                  {t('{orgClasses} кл. · {learners} тест. · {admins} адм.', {
                    orgClasses: org.classes,
                    learners: org.learners,
                    admins: org.admins,
                  })}
                </p>
              </div>
              <div className="row-actions">
                <button className="ghost" type="button" onClick={() => setEditing(editing === org.id ? null : org.id)}>
                  {t(editing === org.id ? 'Закрыть' : 'Изменить')}
                </button>
                <button className="ghost" type="button" onClick={() => confirmRemove(org)}>{t('Удалить')}</button>
              </div>
            </header>
            {editing === org.id && (
              <OrgEditor
                org={org}
                districts={districts}
                onSave={(body) => saveOrganization(org.id, body)}
                onSaved={organizationSaved}
                onError={setError}
              />
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

function OrgEditor({ org, districts, onSave, onSaved, onError }) {
  const { lang, t } = useI18n()
  const [name, setName] = useState(org.name)
  const [nameKk, setNameKk] = useState(org.nameKk || '')
  const [districtId, setDistrictId] = useState(org.districtId || '')
  const [groups, setGroups] = useState(org.groups)

  async function save(event) {
    event.preventDefault()
    onError('')
    try {
      await onSave({
        name,
        nameKk,
        districtId: districts.length ? districtId : org.districtId,
        groups,
      })
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
      <label>
        {t('Название, қазақша')}
        <input value={nameKk} onChange={(event) => setNameKk(event.target.value)} />
      </label>
      {districts.length > 0 && (
        <label>
          {t('Район')}
          <select value={districtId} onChange={(event) => setDistrictId(event.target.value)}>
            <option value="">{t('Выберите район')}</option>
            {districts.map((district) => (
              <option key={district.id} value={district.id}>{pick(lang, district.name, district.nameKk)}</option>
            ))}
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
  const { admins, organizations, form, error, setError, notice, load, patch, create, remove, saveAdmin } = useOrgStaff()

  function confirmRemove(person) {
    if (window.confirm(t('Удалить администратора {name}?', { name: person.displayName }))) remove(person)
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
          <input
            name="login"
            autoComplete="off"
            placeholder="school.admin"
            title={t('3–32 символа латиницей: буквы, цифры, точка, _ или -')}
            value={form.login}
            onChange={patch}
          />
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
            onSave={(body) => saveAdmin(person.id, body)}
            onChanged={load}
            onDelete={() => confirmRemove(person)}
            onError={setError}
          />
        ))}
      </div>
    </section>
  )
}

function OrgAdminRow({ person, organizations, onSave, onChanged, onDelete, onError }) {
  const { lang, t } = useI18n()
  const [displayName, setDisplayName] = useState(person.displayName)
  const [organizationId, setOrganizationId] = useState(person.organizationId)
  const [password, setPassword] = useState('')

  async function save(event) {
    event.preventDefault()
    onError('')
    try {
      await onSave({ displayName, organizationId, password })
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
      <span className="muted">{person.login}</span>
      <button className="ghost" type="button" onClick={onDelete}>{t('Удалить')}</button>
    </article>
  )
}
