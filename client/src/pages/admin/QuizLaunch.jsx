import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuizLaunch } from '../../state/host/quizzes.js'
import { pick, useI18n } from '../../state/i18n.jsx'

export function QuizLaunch() {
  const { lang, t } = useI18n()
  const navigate = useNavigate()
  const { quizzes, hiddenByLang, orgs, error, start } = useQuizLaunch(navigate)
  const [launchId, setLaunchId] = useState('')
  const [orgId, setOrgId] = useState('')
  const [classId, setClassId] = useState('')

  const effectiveOrgId = orgs.length === 1 ? orgs[0].id : orgId
  const classes = orgs.find((org) => org.id === effectiveOrgId)?.classes || []

  function openLaunch(id) {
    setLaunchId((current) => (current === id ? '' : id))
    setOrgId(orgs.length === 1 ? orgs[0].id : '')
    setClassId('')
  }

  function submit(event) {
    event.preventDefault()
    start({ quizId: launchId, organizationId: effectiveOrgId, classId })
  }

  return (
    <section className="stack">
      <div className="section-head"><h1>{t('Квизы')}</h1></div>
      {error && <p className="form-error">{t(error)}</p>}
      {quizzes === null && !error && <p className="muted">{t('Загрузка…')}</p>}
      {quizzes?.length === 0 && <p className="muted">{t(hiddenByLang ? 'В этом языке пока нет квизов.' : 'Пока нет квизов.')}</p>}
      <div className="quiz-list">
        {quizzes?.map((quiz) => (
          <article className="card quiz-card" key={quiz.id}>
            <div>
              <h2>{quiz.title}</h2>
              <p className="muted">{t('{count} вопр.', { count: quiz.questionCount })} · {quiz.lang === 'kk' ? 'Қаз' : 'Рус'}</p>
            </div>
            <div className="top-actions">
              <button className="primary" type="button" onClick={() => openLaunch(quiz.id)}>{t('Запустить')}</button>
            </div>
            {launchId === quiz.id && (
              <form className="launch-box" onSubmit={submit}>
                {orgs.length === 0 ? (
                  <p className="muted">{t('Нет организаций')}</p>
                ) : (
                  <>
                    {orgs.length > 1 && (
                      <label>
                        {t('Организация')}
                        <select value={effectiveOrgId} onChange={(event) => { setOrgId(event.target.value); setClassId('') }}>
                          <option value="">{t('Выберите организацию')}</option>
                          {orgs.map((org) => (
                            <option key={org.id} value={org.id}>{pick(lang, org.name, org.nameKk)}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label>
                      {t('Класс')}
                      <select value={classId} onChange={(event) => setClassId(event.target.value)} disabled={!effectiveOrgId}>
                        <option value="">{t('Выберите класс')}</option>
                        {classes.map((item) => (
                          <option key={item.id} value={item.id}>{t(item.label)}</option>
                        ))}
                      </select>
                    </label>
                    <button className="primary" type="submit" disabled={!classId}>{t('Запустить')}</button>
                  </>
                )}
              </form>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
