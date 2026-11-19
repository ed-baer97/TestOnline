import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { TopbarExtra } from '../../components/layout/topbar.jsx'
import { FitLegend } from '../../components/lesson/FitLegend.jsx'
import { Slide } from '../../components/lesson/Slide.jsx'
import { useI18n } from '../../state/i18n.jsx'
import { useLessonView } from '../../state/lessonView.js'

export default function LessonView({ backTo }) {
  const { t } = useI18n()
  const { id } = useParams()
  const {
    lesson, error, index, seen, answers, setAnswers, result, setResult, pending, setVideoWatched, showSlide, submit,
    isVideo, slide, last, locked, watched, byQuestion, attemptsLeft,
  } = useLessonView(id)
  const testRef = useRef(null)
  const [videoError, setVideoError] = useState(false)

  useEffect(() => {
    setVideoError(false)
  }, [lesson?.id, lesson?.video?.name])

  return (
    <section className="lesson">
      <TopbarExtra>
        <Link className="ghost" to={backTo}>{t('К списку')}</Link>
      </TopbarExtra>
      <div className="section-head">
        <h1>{lesson?.title || t('Урок')}</h1>
      </div>
      {error && <p className="form-error">{t(error)}</p>}
      {!lesson && !error && <p className="muted">{t('Загрузка…')}</p>}
      {slide && (
        <div className="deck">
          <Slide slide={slide} />
          <div className="deck-bar">
            <button className="ghost" type="button" onClick={() => showSlide(Math.max(0, index - 1))} disabled={index === 0}>
              {t('Назад')}
            </button>
            <div className="deck-dots">
              {lesson.slides.map((item, dot) => {
                const classes = []
                if (dot === index) classes.push('on')
                else if (seen?.has(dot)) classes.push('seen')
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={classes.join(' ')}
                    aria-label={t('Слайд {n}', { n: dot + 1 })}
                    onClick={() => showSlide(dot)}
                  />
                )
              })}
            </div>
            {index < last ? (
              <button className="ghost" type="button" onClick={() => showSlide(index + 1)}>
                {t('Дальше')}
              </button>
            ) : (
              <button
                className="primary"
                type="button"
                disabled={!watched}
                onClick={() => testRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                {t('К тесту')}
              </button>
            )}
          </div>
          {!watched && <p className="muted deck-note">{t('Тест откроется после просмотра всех слайдов.')}</p>}
        </div>
      )}
      {isVideo && (
        <div className="deck">
          {lesson.video ? (
            <>
              <video
                className="lesson-video"
                src={`/api/lessons/${lesson.id}/media`}
                controls
                playsInline
                onError={() => setVideoError(true)}
                onCanPlay={() => setVideoError(false)}
                onEnded={() => setVideoWatched(true)}
                onTimeUpdate={(event) => {
                  const player = event.currentTarget
                  if (player.currentTime > 0 && player.duration > 0 && player.currentTime >= player.duration - 0.25) setVideoWatched(true)
                }}
              />
              {videoError && <p className="form-error">{t('Не удалось воспроизвести ролик. Попробуйте обновить страницу или использовать MP4 (H.264).')}</p>}
            </>
          ) : (
            <p className="muted">{t('Ролик ещё не загружен.')}</p>
          )}
          {watched ? (
            <button className="primary add" type="button" onClick={() => testRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              {t('К тесту')}
            </button>
          ) : (
            <p className="muted deck-note">{t('Тест откроется после просмотра ролика.')}</p>
          )}
        </div>
      )}
      {lesson && watched && (
        <form className="lesson-test" ref={testRef} onSubmit={submit}>
          <h2>{t('Тест')}</h2>
          {lesson.questions.map((question, questionIndex) => {
            const verdict = byQuestion.get(question.id)
            return (
              <fieldset className="question-card" key={question.id}>
                <FitLegend>{questionIndex + 1}. {question.text}</FitLegend>
                {question.options.map((option, optionIndex) => {
                  const picked = answers[question.id] === optionIndex
                  const mark = verdict
                    ? optionIndex === verdict.correctIndex
                      ? 'good'
                      : picked
                        ? 'bad'
                        : ''
                    : ''
                  return (
                    <label className={`choice ${mark}`} key={`${question.id}-${optionIndex}`}>
                      <input
                        type="radio"
                        name={question.id}
                        checked={picked}
                        disabled={locked}
                        onChange={() => {
                          if (locked) return
                          setAnswers((current) => ({ ...current, [question.id]: optionIndex }))
                          setResult(null)
                        }}
                      />
                      {option.text}
                    </label>
                  )
                })}
              </fieldset>
            )
          })}
          {result && (
            <p className="saved">
              {t('Результат: {score} из {total}', { score: result.score, total: result.total })}
              {result.repeated ? t(' · показан сохранённый результат') : ''}
            </p>
          )}
          {locked ? (
            <p className="muted">{t('Тест пройден. Повторная отправка не предусмотрена.')}</p>
          ) : (
            <>
              {attemptsLeft != null && attemptsLeft > 0 && lesson.attempts && (
                <p className="muted">{t('Осталось попыток: {count}', { count: attemptsLeft })}</p>
              )}
              <button className="primary add" type="submit" disabled={pending}>
                {t(pending ? 'Отправка…' : result ? 'Проверить снова' : 'Проверить')}
              </button>
            </>
          )}
        </form>
      )}
    </section>
  )
}
