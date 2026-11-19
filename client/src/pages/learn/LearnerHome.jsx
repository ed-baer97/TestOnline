import { Link } from 'react-router-dom'
import { LearnFrame } from '../../components/layout/LearnFrame.jsx'
import { useI18n } from '../../state/i18n.jsx'
import { useLearnerHome } from '../../state/learnerHome.js'
import LessonView from '../lessons/LessonView.jsx'

function groupLessons(lessons, lang) {
  const blocks = []
  const index = new Map()
  for (const lesson of lessons || []) {
    const key = lesson.section?.id || ''
    if (!index.has(key)) {
      const block = { key, title: lesson.section?.name || '', sort: lesson.section?.sortOrder ?? 9999, lessons: [] }
      index.set(key, block)
      blocks.push(block)
    }
    index.get(key).lessons.push(lesson)
  }
  const locale = lang === 'kk' ? 'kk' : 'ru'
  return blocks.sort((left, right) => left.sort - right.sort || left.title.localeCompare(right.title, locale))
}

export default function LearnerHome({ onLogout }) {
  const { lang, t } = useI18n()
  const { me, lessons, error } = useLearnerHome()

  return (
    <LearnFrame onLogout={onLogout}>
      {error && <p className="form-error">{t(error)}</p>}
      {!me && !error && <p className="muted">{t('Загрузка…')}</p>}
      {me && (
        <>
          <div className="section-head"><h1>{me.displayName}</h1></div>
          <p className="muted">{me.organizationName} · {t(me.classLabel || me.className)}</p>
          <div className="stack">
            {lessons?.length === 0 && <p className="muted">{t('Для вашего класса пока нет уроков.')}</p>}
            {groupLessons(lessons, lang).map((block) => (
              <section className="stack" key={block.key || 'loose'}>
                {block.title && <h2>{block.title}</h2>}
                {block.lessons.map((lesson) => (
                  <Link className="lesson-card" key={lesson.id} to={`/learn/lessons/${lesson.id}`}>
                    <div>
                      <h2>{lesson.title}</h2>
                      <p className="muted">
                        {lesson.format === 'video'
                          ? t('Видео · {count} вопр.', { count: lesson.questionCount })
                          : t('Презентация · {slides} сл. · {count} вопр.', { slides: lesson.slideCount, count: lesson.questionCount })}
                      </p>
                    </div>
                    <span>{lesson.best ? t('{score} из {total}', { score: lesson.best.score, total: lesson.best.total }) : t('Открыть')}</span>
                  </Link>
                ))}
              </section>
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
