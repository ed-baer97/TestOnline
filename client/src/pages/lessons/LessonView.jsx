import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { TopbarExtra } from '../../components/layout/topbar.jsx'
import { FitLegend } from '../../components/lesson/FitLegend.jsx'
import { Slide } from '../../components/lesson/Slide.jsx'
import { useI18n } from '../../state/i18n.jsx'
import { useLessonView } from '../../state/lessonView.js'

export default function LessonView({ backTo }) {
  const { lang, setLang, t } = useI18n()
  const { id } = useParams()
  const {
    lesson, available, languages, error, index, seen, answers, result, pending, setVideoWatched, showSlide, submit,
    isVideo, slide, last, locked, lockedLang, lockedOtherLang, watched, byQuestion, attemptsLeft,
    questionIndex, totalQuestions, currentQuestion, allAnswered, setQuestionIndex, chooseAnswer,
  } = useLessonView(id, lang)
  const testRef = useRef(null)
  const [videoError, setVideoError] = useState(false)

  useEffect(() => {
    setVideoError(false)
  }, [lesson?.id, lang, lesson?.video?.name])

  const otherLang = lang === 'kk' ? 'ru' : 'kk'
  const otherAvailable = Boolean(languages[otherLang])

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
      {lesson && !available && (
        <div className="question-card">
          <p className="form-error">{t('Данный материал не загружен')}</p>
          {otherAvailable && (
            <div className="row-actions">
              <button className="primary" type="button" onClick={() => setLang(otherLang)}>
                {t(otherLang === 'kk' ? 'Открыть на казахском' : 'Открыть на русском')}
              </button>
            </div>
          )}
        </div>
      )}
      {available && slide && (
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
            ) : !lockedOtherLang ? (
              <button
                className="primary"
                type="button"
                disabled={!watched}
                onClick={() => testRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                {t('К тесту')}
              </button>
            ) : <span />}
          </div>
          {!watched && !lockedOtherLang && <p className="muted deck-note">{t('Тест откроется после просмотра всех слайдов.')}</p>}
        </div>
      )}
      {available && isVideo && (
        <div className="deck">
          {lesson.video ? (
            <>
              <video
                key={`${lesson.id}-${lang}`}
                className="lesson-video"
                src={`/api/lessons/${lesson.id}/media?lang=${lang}`}
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
          {!lockedOtherLang && (watched ? (
            <button className="primary add" type="button" onClick={() => testRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              {t('К тесту')}
            </button>
          ) : (
            <p className="muted deck-note">{t('Тест откроется после просмотра ролика.')}</p>
          ))}
        </div>
      )}
      {lesson && available && lockedOtherLang && (
        <div className="question-card">
          <p className="saved">
            {t('Результат: {score} из {total}', { score: result.score, total: result.total })}
          </p>
          <p className="muted">
            {t(lockedLang === 'kk'
              ? 'Тест уже пройден на казахском языке. Повторная отправка не предусмотрена.'
              : 'Тест уже пройден на русском языке. Повторная отправка не предусмотрена.')}
          </p>
          {languages[lockedLang] && (
            <div className="row-actions">
              <button className="ghost" type="button" onClick={() => setLang(lockedLang)}>
                {t(lockedLang === 'kk' ? 'Открыть результат на казахском' : 'Открыть результат на русском')}
              </button>
            </div>
          )}
        </div>
      )}
      {lesson && available && watched && !lockedOtherLang && (
        <form className="lesson-test" ref={testRef} onSubmit={submit}>
          <div className="lesson-test-head">
            <h2>{t('Тест')}</h2>
            {totalQuestions > 0 && (
              <span className="muted">{t('Вопрос {n} из {total}', { n: questionIndex + 1, total: totalQuestions })}</span>
            )}
          </div>
          {result && (
            <p className="saved">
              {t('Результат: {score} из {total}', { score: result.score, total: result.total })}
              {result.repeated ? t(' · показан сохранённый результат') : ''}
            </p>
          )}
          {currentQuestion && (() => {
            const verdict = byQuestion.get(currentQuestion.id)
            return (
              <fieldset className="question-card" key={currentQuestion.id}>
                <FitLegend>{questionIndex + 1}. {currentQuestion.text}</FitLegend>
                {currentQuestion.options.map((option, optionIndex) => {
                  const picked = answers[currentQuestion.id] === optionIndex
                  const mark = verdict
                    ? optionIndex === verdict.correctIndex
                      ? 'good'
                      : picked
                        ? 'bad'
                        : ''
                    : ''
                  return (
                    <label className={`choice ${mark}`} key={`${currentQuestion.id}-${optionIndex}`}>
                      <input
                        type="radio"
                        name={currentQuestion.id}
                        checked={picked}
                        disabled={locked}
                        onChange={() => chooseAnswer(currentQuestion.id, optionIndex)}
                      />
                      {option.text}
                    </label>
                  )
                })}
              </fieldset>
            )
          })()}
          <div className="deck-bar test-bar">
            <button
              className="ghost"
              type="button"
              disabled={questionIndex === 0}
              onClick={() => setQuestionIndex(Math.max(0, questionIndex - 1))}
            >
              {t('Назад')}
            </button>
            <div className="test-steps" role="navigation" aria-label={t('Вопросы теста')}>
              {lesson.questions.map((question, step) => {
                const verdict = byQuestion.get(question.id)
                const classes = ['test-step']
                if (step === questionIndex) classes.push('on')
                if (verdict) classes.push(verdict.ok ? 'good' : 'bad')
                else if (answers[question.id] != null) classes.push('done')
                return (
                  <button
                    key={question.id}
                    type="button"
                    className={classes.join(' ')}
                    aria-label={t('Вопрос {n}', { n: step + 1 })}
                    aria-current={step === questionIndex ? 'step' : undefined}
                    onClick={() => setQuestionIndex(step)}
                  >
                    {step + 1}
                  </button>
                )
              })}
            </div>
            {questionIndex < totalQuestions - 1 ? (
              <button
                className={answers[currentQuestion?.id] != null && !locked ? 'primary' : 'ghost'}
                type="button"
                onClick={() => setQuestionIndex(Math.min(totalQuestions - 1, questionIndex + 1))}
              >
                {t('Дальше')}
              </button>
            ) : !locked ? (
              <button className="primary" type="submit" disabled={pending}>
                {t(pending ? 'Отправка…' : result ? 'Проверить снова' : 'Проверить')}
              </button>
            ) : <span />}
          </div>
          {!locked && allAnswered && questionIndex < totalQuestions - 1 && (
            <button className="primary add" type="submit" disabled={pending}>
              {t(pending ? 'Отправка…' : result ? 'Проверить снова' : 'Проверить')}
            </button>
          )}
          {locked ? (
            <p className="muted deck-note">{t('Тест пройден. Повторная отправка не предусмотрена.')}</p>
          ) : (
            attemptsLeft != null && attemptsLeft > 0 && lesson.attempts && (
              <p className="muted deck-note">{t('Осталось попыток: {count}', { count: attemptsLeft })}</p>
            )
          )}
        </form>
      )}
    </section>
  )
}
