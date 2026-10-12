import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { pick, useI18n } from '../i18n.jsx'
import { TopbarSlot, TopbarSlots } from '../topbar.jsx'
import LessonView from './LessonView.jsx'

function lessonCounts(lesson, lang) {
  const kk = lang === 'kk' && (lesson.slideCountKk || lesson.questionCountKk || lesson.hasVideoKk)
  return {
    slides: kk ? lesson.slideCountKk : lesson.slideCount,
    questions: kk ? lesson.questionCountKk : lesson.questionCount,
  }
}

export function LearnFrame({ onLogout, children }) {
  const { t } = useI18n()
  return (
    <TopbarSlots>
      <main className="sheet admin-sheet">
        <header className="topbar">
          <Link className="brand" to="/learn">Saqbol</Link>
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
  const { lang, t } = useI18n()
  const [me, setMe] = useState(null)
  const [lessons, setLessons] = useState(null)
  const [live, setLive] = useState([])
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

  useEffect(() => {
    if (!me) return undefined
    let stop = false
    async function pull() {
      try {
        const data = await api.liveQuizzes()
        if (!stop) setLive(data.quizzes)
      } catch {
        if (!stop) setLive([])
      }
    }
    pull()
    const timer = setInterval(pull, 3000)
    return () => {
      stop = true
      clearInterval(timer)
    }
  }, [me])

  return (
    <LearnFrame onLogout={onLogout}>
      {error && <p className="form-error">{t(error)}</p>}
      {!me && !error && <p className="muted">{t('Загрузка…')}</p>}
      {me && (
        <>
          <div className="section-head"><h1>{me.displayName}</h1></div>
          <p className="muted">{pick(lang, me.organizationName, me.organizationNameKk)} · {t(me.classLabel || me.className)}</p>
          <div className="stack">
            {live.map((quiz) => (
              <Link className="lesson-card live-quiz" key={quiz.code} to={`/play/${quiz.code}`}>
                <div>
                  <h2>{quiz.title}</h2>
                  <p className="muted">{t('Активный квиз')}</p>
                </div>
                <span>{t('Подключиться')}</span>
              </Link>
            ))}
            {lessons?.length === 0 && <p className="muted">{t('Для вашего класса пока нет уроков.')}</p>}
            {lessons?.map((lesson) => (
              <Link className="lesson-card" key={lesson.id} to={`/learn/lessons/${lesson.id}`}>
                <div>
                  <h2>{pick(lang, lesson.title, lesson.titleKk)}</h2>
                  <p className="muted">{lesson.format === 'video' ? t('Видео · {count} вопр.', { count: lessonCounts(lesson, lang).questions }) : t('Презентация · {slides} сл. · {count} вопр.', { slides: lessonCounts(lesson, lang).slides, count: lessonCounts(lesson, lang).questions })}</p>
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
