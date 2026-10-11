import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/index.js'
import { LearnFrame } from '../components/layout/LearnFrame.jsx'
import LessonView from './LessonView.jsx'

export default function LearnerHome({ onLogout }) {
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
      {error && <p className="form-error">{error}</p>}
      {!me && !error && <p className="muted">Загрузка…</p>}
      {me && (
        <>
          <div className="section-head"><h1>{me.displayName}</h1></div>
          <p className="muted">{me.organizationName} · {me.classLabel || me.className}</p>
          <div className="stack">
            {lessons?.length === 0 && <p className="muted">Для вашего класса пока нет уроков.</p>}
            {lessons?.map((lesson) => (
              <Link className="lesson-card" key={lesson.id} to={`/learn/lessons/${lesson.id}`}>
                <div>
                  <h2>{lesson.title}</h2>
                  <p className="muted">{lesson.format === 'video' ? `Видео · ${lesson.questionCount} вопр.` : `Презентация · ${lesson.slideCount} сл. · ${lesson.questionCount} вопр.`}</p>
                </div>
                <span>{lesson.best ? `${lesson.best.score} из ${lesson.best.total}` : 'Открыть'}</span>
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
