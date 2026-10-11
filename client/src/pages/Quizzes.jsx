import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, hostKey } from '../api.js'
import { pick, useI18n } from '../i18n.jsx'
import { HostFrame } from './HostFrame.jsx'

export function QuizCatalog({ editBase, classLaunch = false }) {
  const { lang, t } = useI18n()
  const navigate = useNavigate()
  const [quizzes, setQuizzes] = useState(null)
  const [error, setError] = useState('')
  const [launchId, setLaunchId] = useState('')
  const [mode, setMode] = useState('public')
  const [orgs, setOrgs] = useState(null)
  const [orgId, setOrgId] = useState('')
  const [classId, setClassId] = useState('')

  async function load() {
    const quizData = await api.quizzes()
    setQuizzes(quizData.quizzes)
  }

  useEffect(() => {
    load().catch((err) => setError(err.message))
    if (!classLaunch) return undefined
    api.launchTargets().then((data) => setOrgs(data.organizations)).catch(() => setOrgs([]))
    return undefined
  }, [classLaunch])

  const classes = orgs?.find((org) => org.id === orgId)?.classes || []

  function openLaunch(id) {
    setError('')
    setLaunchId(id)
    setMode('public')
    setOrgId('')
    setClassId('')
  }

  async function start(id, nextMode = 'public') {
    setError('')
    try {
      const body = { quizId: id, mode: nextMode }
      if (nextMode === 'private') {
        body.organizationId = orgId
        body.classId = classId
      }
      const room = await api.createRoom(body)
      sessionStorage.setItem(hostKey(room.code), room.hostToken)
      navigate(`/host/room/${room.code}`)
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(quiz) {
    if (!window.confirm(t('Удалить «{name}»?', { name: quiz.title }))) return
    await api.deleteQuiz(quiz.id)
    await load()
  }

  return (
    <>
      {error && <p className="form-error">{t(error)}</p>}
      {quizzes === null && <p className="muted">{t('Загрузка…')}</p>}
      {quizzes?.length === 0 && <p className="muted">{t('Пока нет квизов. Создайте первый.')}</p>}
      <div className="quiz-list">
        {quizzes?.map((quiz) => (
          <article className="card quiz-card" key={quiz.id}>
            <div>
              <h2>{quiz.title}</h2>
              <p className="muted">{t('{count} вопр.', { count: quiz.questionCount })}</p>
            </div>
            <div className="top-actions">
              <button className="primary" type="button" data-testid="start-quiz" onClick={() => openLaunch(quiz.id)}>{t('Запустить')}</button>
              <Link to={`/host/quiz/${quiz.id}/stats`}>{t('Статистика')}</Link>
              <Link to={`${editBase}/${quiz.id}`}>{t('Править')}</Link>
              <button className="ghost" type="button" onClick={() => remove(quiz)}>{t('Удалить')}</button>
            </div>
            {launchId === quiz.id && (
              <form className="launch-box" onSubmit={(event) => { event.preventDefault(); start(quiz.id, mode) }}>
                <div className="tone-row">
                  <button className={`ghost ${mode === 'public' ? 'on' : ''}`} type="button" onClick={() => setMode('public')}>{t('Публичный')}</button>
                  {orgs?.length > 0 && <button className={`ghost ${mode === 'private' ? 'on' : ''}`} type="button" onClick={() => setMode('private')}>{t('Приватный')}</button>}
                </div>
                {mode === 'private' && (
                  <>
                    <label>
                      {t('Организация')}
                      <select value={orgId} onChange={(event) => { setOrgId(event.target.value); setClassId('') }}>
                        <option value="">{t('Выберите организацию')}</option>
                        {orgs.map((org) => <option key={org.id} value={org.id}>{pick(lang, org.name, org.nameKk)}</option>)}
                      </select>
                    </label>
                    <label>
                      {t('Класс')}
                      <select value={classId} onChange={(event) => setClassId(event.target.value)} disabled={!orgId}>
                        <option value="">{t('Выберите класс')}</option>
                        {classes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                      </select>
                    </label>
                  </>
                )}
                <button className="primary" type="submit" disabled={mode === 'private' && !classId}>{t('Запустить')}</button>
              </form>
            )}
          </article>
        ))}
      </div>
    </>
  )
}

export function QuizLaunch() {
  const { lang, t } = useI18n()
  const navigate = useNavigate()
  const [quizzes, setQuizzes] = useState(null)
  const [orgs, setOrgs] = useState([])
  const [error, setError] = useState('')
  const [launchId, setLaunchId] = useState('')
  const [orgId, setOrgId] = useState('')
  const [classId, setClassId] = useState('')

  useEffect(() => {
    Promise.all([api.launchQuizzes(), api.launchTargets()]).then(([quizData, targetData]) => {
      const nextOrgs = targetData.organizations || []
      setQuizzes(quizData.quizzes)
      setOrgs(nextOrgs)
      if (nextOrgs.length === 1) setOrgId(nextOrgs[0].id)
    }).catch((err) => setError(err.message))
  }, [])

  const classes = orgs.find((org) => org.id === orgId)?.classes || []

  function openLaunch(id) {
    setError('')
    setLaunchId(id)
    setClassId('')
    if (orgs.length === 1) setOrgId(orgs[0].id)
  }

  async function start(event) {
    event.preventDefault()
    setError('')
    try {
      const room = await api.createRoom({ quizId: launchId, mode: 'private', organizationId: orgId, classId })
      sessionStorage.setItem(hostKey(room.code), room.hostToken)
      navigate(`/host/room/${room.code}`)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="stack">
      <div className="section-head"><h1>{t('Квизы')}</h1></div>
      {error && <p className="form-error">{t(error)}</p>}
      {quizzes === null && <p className="muted">{t('Загрузка…')}</p>}
      {quizzes?.length === 0 && <p className="muted">{t('Пока нет квизов.')}</p>}
      <div className="quiz-list">
        {quizzes?.map((quiz) => (
          <article className="card quiz-card" key={quiz.id}>
            <div>
              <h2>{quiz.title}</h2>
              <p className="muted">{t('{count} вопр.', { count: quiz.questionCount })}</p>
            </div>
            <div className="top-actions">
              <button className="primary" type="button" onClick={() => openLaunch(quiz.id)}>{t('Запустить')}</button>
            </div>
            {launchId === quiz.id && (
              <form className="launch-box" onSubmit={start}>
                {orgs.length > 1 && (
                  <label>
                    {t('Организация')}
                    <select value={orgId} onChange={(event) => { setOrgId(event.target.value); setClassId('') }}>
                      <option value="">{t('Выберите организацию')}</option>
                      {orgs.map((org) => <option key={org.id} value={org.id}>{pick(lang, org.name, org.nameKk)}</option>)}
                    </select>
                  </label>
                )}
                <label>
                  {t('Класс')}
                  <select value={classId} onChange={(event) => setClassId(event.target.value)} disabled={!orgId}>
                    <option value="">{t('Выберите класс')}</option>
                    {classes.map((item) => <option key={item.id} value={item.id}>{t(item.label)}</option>)}
                  </select>
                </label>
                <button className="primary" type="submit" disabled={!classId}>{t('Запустить')}</button>
              </form>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

export default function Quizzes({ onLogout }) {
  const [account, setAccount] = useState('')

  useEffect(() => {
    api.me().then((me) => setAccount(me.login || '')).catch(() => setAccount(''))
  }, [])

  return (
    <HostFrame onLogout={onLogout} account={account} title="Квизы">
      <QuizCatalog editBase="/host/quiz" />
    </HostFrame>
  )
}
