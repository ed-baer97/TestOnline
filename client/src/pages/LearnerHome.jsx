import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { pick, useI18n } from '../i18n.jsx'
import { Brand } from '../Brand.jsx'
import { EnvControls, TopbarSlot, TopbarSlots } from '../topbar.jsx'
import LessonView from './LessonView.jsx'

function lessonCounts(lesson, lang) {
  const kk = lang === 'kk' && (lesson.slideCountKk || lesson.questionCountKk || lesson.hasVideoKk)
  return {
    slides: kk ? lesson.slideCountKk : lesson.slideCount,
    questions: kk ? lesson.questionCountKk : lesson.questionCount,
  }
}

export function LearnFrame({ me, onLogout, children }) {
  const { lang, t } = useI18n()
  const orgName = me ? pick(lang, me.organizationName, me.organizationNameKk) : ''
  const classText = me ? t(me.classLabel || me.className || '') : ''
  const sub = [orgName, classText].filter(Boolean).join(' · ')
  return (
    <TopbarSlots>
      <main className="sheet admin-sheet">
        <header className="topbar">
          <div className="topbar-brand">
            <Brand to="/learn" />
            {me?.displayName && (
              <div className="account-meta">
                <strong>{me.displayName}</strong>
                {sub && <span className="muted">{sub}</span>}
              </div>
            )}
          </div>
          <div className="top-actions">
            <TopbarSlot />
            <EnvControls />
            <button className="ghost" type="button" onClick={onLogout}>{t('Выйти')}</button>
          </div>
        </header>
        {children}
      </main>
    </TopbarSlots>
  )
}

export default function LearnerHome({ me: initialMe, onLogout }) {
  const { lang, t } = useI18n()
  const [me, setMe] = useState(initialMe || null)
  const [lessons, setLessons] = useState(null)
  const [live, setLive] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    const tasks = [initialMe ? Promise.resolve(initialMe) : api.me(), api.lessons()]
    Promise.all(tasks)
      .then(([profile, data]) => {
        if (!profile?.ok) setError('Нужен вход')
        else {
          setMe(profile)
          setLessons(data.lessons)
        }
      })
      .catch((err) => setError(err.message))
  }, [initialMe])

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

  const completedCount = lessons ? lessons.filter((item) => Boolean(item.best)).length : 0

  return (
    <LearnFrame me={me} onLogout={onLogout}>
      {error && <p className="form-error">{t(error)}</p>}
      {!me && !error && <p className="muted">{t('Загрузка…')}</p>}
      {me && (
        <section className="stack">
          <div className="section-head">
            <div>
              <h1>{t('Уроки')}</h1>
              <p className="muted">{pick(lang, me.organizationName, me.organizationNameKk)} · {t(me.classLabel || me.className)}</p>
            </div>
            {lessons && lessons.length > 0 && (
              <span className="progress-pill">
                {t('Пройдено: {done} из {total}', { done: completedCount, total: lessons.length })}
              </span>
            )}
          </div>
          <div className="stack">
            {live.map((quiz) => (
              <Link className="lesson-card live-quiz" key={quiz.code} to={`/play/${quiz.code}`}>
                <div>
                  <h2>{quiz.title}</h2>
                  <p className="muted">{t('Активный квиз')}</p>
                </div>
                <span className="primary">{t('Подключиться')}</span>
              </Link>
            ))}
            {lessons?.length === 0 && <p className="muted">{t('Для вашего класса пока нет уроков.')}</p>}
            {lessons?.map((lesson) => {
              const done = Boolean(lesson.best)
              return (
                <Link className={`lesson-card ${done ? 'done' : ''}`} key={lesson.id} to={`/learn/lessons/${lesson.id}`}>
                  <div>
                    <h2>{pick(lang, lesson.title, lesson.titleKk)}</h2>
                    <p className="muted">
                      {lesson.format === 'video'
                        ? t('Видео · {count} вопр.', { count: lessonCounts(lesson, lang).questions })
                        : t('Презентация · {slides} сл. · {count} вопр.', { slides: lessonCounts(lesson, lang).slides, count: lessonCounts(lesson, lang).questions })}
                    </p>
                  </div>
                  <span className={done ? 'score-pill' : 'ghost'}>
                    {done ? `✓ ${t('{score} из {total}', { score: lesson.best.score, total: lesson.best.total })}` : t('Открыть')}
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      )}
    </LearnFrame>
  )
}

export function LearnLesson({ me, onLogout }) {
  return (
    <LearnFrame me={me} onLogout={onLogout}>
      <LessonView backTo="/learn" />
    </LearnFrame>
  )
}

