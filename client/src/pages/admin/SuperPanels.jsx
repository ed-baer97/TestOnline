import { useState } from 'react'
import { Notice } from '../../components/admin/ui.jsx'
import { useRegionalStaff, useRegions } from '../../state/admin/regions.js'
import { pick, useI18n } from '../../state/i18n.jsx'

export function Regions() {
  const { lang, t } = useI18n()
  const { regions, name, setName, nameKk, setNameKk, drafts, setDrafts, error, notice, create, rename, seed, remove } = useRegions()

  function confirmRemove(region) {
    if (window.confirm(t('Удалить регион «{name}»?', { name: pick(lang, region.name, region.nameKk) }))) remove(region)
  }

  return (
    <section className="stack">
      <div className="section-head"><h1>{t('Регионы')}</h1></div>
      <Notice error={error} notice={notice} />
      <form className="admin-form" onSubmit={create}>
        <label>
          {t('Новый регион')}
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('Мангыстауская область')} />
        </label>
        <label>
          {t('Название, қазақша')}
          <input value={nameKk} onChange={(event) => setNameKk(event.target.value)} placeholder="Маңғыстау облысы" />
        </label>
        <button className="primary add" type="submit">{t('Создать регион')}</button>
      </form>
      {regions === null && !error && <p className="muted">{t('Загрузка…')}</p>}
      <div className="stack">
        {regions?.map((region) => {
          const draft = drafts[region.id] || { name: region.name, nameKk: region.nameKk || '' }
          const regionLabel = pick(lang, region.name, region.nameKk)
          return (
            <article className="person" key={region.id}>
              <form onSubmit={(event) => rename(event, region.id)}>
                <input
                  aria-label={t('Название {name}', { name: regionLabel })}
                  value={draft.name}
                  onChange={(event) => setDrafts((current) => ({
                    ...current,
                    [region.id]: { ...(current[region.id] || draft), name: event.target.value },
                  }))}
                />
                <input
                  aria-label={t('Название, қазақша')}
                  placeholder={t('Название, қазақша')}
                  value={draft.nameKk}
                  onChange={(event) => setDrafts((current) => ({
                    ...current,
                    [region.id]: { ...(current[region.id] || draft), nameKk: event.target.value },
                  }))}
                />
                <button className="ghost" type="submit">{t('Сохранить')}</button>
              </form>
              <p className="muted">
                {t('{organizations} орг. · {admins} адм. · {learners} тест.', {
                  organizations: region.organizations,
                  admins: region.admins,
                  learners: region.learners,
                })}
              </p>
              {/манг[ыи]стау|маңғыстау/i.test(`${region.name} ${region.nameKk || ''}`) && (
                <button className="ghost" type="button" onClick={() => seed(region)}>{t('Загрузить школы')}</button>
              )}
              <button className="ghost" type="button" onClick={() => confirmRemove(region)}>{t('Удалить')}</button>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export function RegionalStaff() {
  const { lang, t } = useI18n()
  const { admins, regions, form, error, setError, notice, load, patch, create, remove, saveAdmin } = useRegionalStaff()

  function confirmRemove(person) {
    if (window.confirm(t('Удалить администратора {name}?', { name: person.displayName }))) remove(person)
  }

  return (
    <section className="stack">
      <div className="section-head"><h1>{t('Админы областей')}</h1></div>
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
            placeholder="admin.region"
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
          {t('Регион')}
          <select name="regionId" value={form.regionId} onChange={patch}>
            {regions.length === 0 && <option value="">{t('Сначала создайте регион')}</option>}
            {regions.map((region) => <option key={region.id} value={region.id}>{pick(lang, region.name, region.nameKk)}</option>)}
          </select>
        </label>
        <button className="primary add" type="submit" disabled={!regions.length}>{t('Создать администратора')}</button>
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
  const { lang, t } = useI18n()
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
        <input aria-label={t('Имя')} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        <select aria-label={t('Регион')} value={regionId} onChange={(event) => setRegionId(event.target.value)}>
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
      <span className="muted">{person.login}</span>
      <button className="ghost" type="button" onClick={onDelete}>{t('Удалить')}</button>
    </article>
  )
}
