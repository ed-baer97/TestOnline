import { Link } from 'react-router-dom'
import { LearnFrame } from '../../components/layout/LearnFrame.jsx'
import { useLearnerHome } from '../../state/learnerHome.js'
import LessonView from '../lessons/LessonView.jsx'

export default function LearnerHome({ onLogout }) {
  const { me, lessons, error } = useLearnerHome()

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
