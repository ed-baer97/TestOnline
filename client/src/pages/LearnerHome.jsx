import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { useI18n } from '../i18n.jsx'
import { TopbarSlot, TopbarSlots } from '../topbar.jsx'
import LessonView from './LessonView.jsx'

export function LearnFrame({ onLogout, children }) {
  const { t } = useI18n()
  return (
    <TopbarSlots>
      <main className="sheet admin-sheet">
        <header className="topbar">
          <Link className="brand" to="/learn">TestOnline</Link>
          <div className="top-actions">
            <TopbarSlot />
            <button className="ghost" type="button" onClick={onLogout}>{t('Выйти')}</button>
          </div>
        </header>
        {children}
      </main>
    </TopbarSlots>
  )
}

export default function LearnerHome({ onLogout }) {
  const { t } = useI18n()
  const [me, setMe] = useState(null)
  const [lessons, setLessons] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.me(), api.lessons()])
      .then(([profile, data]) => {
        if (!profile.ok) setError('Нужен вход')
        else {
          setMe(profile)
          setLessons(data.lessons)
        }
      })
      .catch((err) => setError(err.message))
  }, [])

  return (
    <LearnFrame onLogout={onLogout}>
      {error && <p className="form-error">{t(error)}</p>}
      {!me && !error && <p className="muted">{t('Загрузка…')}</p>}
      {me && (
        <>
          <div className="section-head"><h1>{me.displayName}</h1></div>
          <p className="muted">{me.organizationName} · {me.classLabel || me.className}</p>
          <div className="stack">
            {lessons?.length === 0 && <p className="muted">{t('Для вашего класса пока нет уроков.')}</p>}
            {lessons?.map((lesson) => (
              <Link className="lesson-card" key={lesson.id} to={`/learn/lessons/${lesson.id}`}>
                <div>
                  <h2>{lesson.title}</h2>
                  <p className="muted">{lesson.format === 'video' ? t('Видео · {count} вопр.', { count: lesson.questionCount }) : t('Презентация · {slides} сл. · {count} вопр.', { slides: lesson.slideCount, count: lesson.questionCount })}</p>
                </div>
                <span>{lesson.best ? t('{score} из {total}', { score: lesson.best.score, total: lesson.best.total }) : t('Открыть')}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </LearnFrame>
  )
}

export function LearnLesson({ onLogout }) {
  return (
    <LearnFrame onLogout={onLogout}>
      <LessonView backTo="/learn" />
    </LearnFrame>
  )
}
