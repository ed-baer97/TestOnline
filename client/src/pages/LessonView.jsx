import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { TopbarExtra } from '../topbar.jsx'

export default function LessonView({ backTo }) {
  const { id } = useParams()
  const [lesson, setLesson] = useState(null)
  const [error, setError] = useState('')
  const [index, setIndex] = useState(0)
  const [seen, setSeen] = useState(() => new Set([0]))
  const [videoWatched, setVideoWatched] = useState(false)
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [pending, setPending] = useState(false)
  const testRef = useRef(null)

  useEffect(() => {
    setLesson(null)
    setIndex(0)
    setSeen(new Set([0]))
    setVideoWatched(false)
    setAnswers({})
    setResult(null)
    api.lesson(id).then((data) => {
      setLesson(data)
      const last = data.attempts?.last
      if (data.attempts?.locked && last) {
        setResult({ ...last, attempts: data.attempts })
        if (last.results) {
          const picked = {}
          for (const item of last.results) if (item.chosen >= 0) picked[item.questionId] = item.chosen
          setAnswers(picked)
        }
      }
    }).catch((err) => setError(err.message))
  }, [id])

  function showSlide(nextIndex) {
    setIndex(nextIndex)
    setSeen((current) => {
      if (current.has(nextIndex)) return current
      const next = new Set(current)
      next.add(nextIndex)
      return next
    })
  }

  useEffect(() => {
    function onKey(event) {
      if (!lesson || lesson.format === 'video' || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key === 'ArrowRight') showSlide(Math.min(lesson.slides.length - 1, index + 1))
      if (event.key === 'ArrowLeft') showSlide(Math.max(0, index - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lesson, index])

  async function submit(event) {
    event.preventDefault()
    if (!lesson || pending || locked) return
    if (lesson.questions.some((question) => answers[question.id] == null)) {
      setError('Ответьте на все вопросы')
      return
    }
    setError('')
    setPending(true)
    try {
      const data = await api.checkLesson(id, lesson.questions.map((question) => ({
        questionId: question.id,
        optionIndex: answers[question.id],
      })))
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setPending(false)
    }
  }

  const isVideo = lesson?.format === 'video'
  const slide = !isVideo ? lesson?.slides[index] : null
  const last = lesson?.slides?.length ? lesson.slides.length - 1 : 0
  const locked = Boolean(result?.attempts?.locked)
  const watched = locked || (isVideo ? videoWatched : Boolean(lesson?.slides?.length) && seen.size > last)
  const byQuestion = new Map((result?.results || []).map((item) => [item.questionId, item]))
  const attemptsLeft = result?.attempts ? result.attempts.max - result.attempts.used : lesson?.attempts ? lesson.attempts.max - lesson.attempts.used : null

  return (
    <section className="lesson">
      <TopbarExtra>
        <Link className="ghost" to={backTo}>К списку</Link>
      </TopbarExtra>
      <div className="section-head">
        <h1>{lesson?.title || 'Урок'}</h1>
      </div>
      {error && <p className="form-error">{error}</p>}
      {!lesson && !error && <p className="muted">Загрузка…</p>}
      {slide && (
        <div className="deck">
          <Slide slide={slide} />
          <div className="deck-bar">
            <button className="ghost" type="button" onClick={() => showSlide(Math.max(0, index - 1))} disabled={index === 0}>
              Назад
            </button>
            <div className="deck-dots">
              {lesson.slides.map((item, dot) => (
                <button
                  key={item.id}
                  type="button"
                  className={dot === index ? 'on' : ''}
                  aria-label={`Слайд ${dot + 1}`}
                  onClick={() => showSlide(dot)}
                />
              ))}
            </div>
            {index < last ? (
              <button className="ghost" type="button" onClick={() => showSlide(index + 1)}>
                Дальше
              </button>
            ) : (
              <button
                className="primary"
                type="button"
                disabled={!watched}
                onClick={() => testRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                К тесту
              </button>
            )}
          </div>
          {!watched && <p className="muted deck-note">Тест откроется после просмотра всех слайдов.</p>}
        </div>
      )}
      {isVideo && (
        <div className="deck">
          {lesson.video ? (
            <video
              className="lesson-video"
              src={`/api/lessons/${lesson.id}/media`}
              controls
              playsInline
              onEnded={() => setVideoWatched(true)}
              onTimeUpdate={(event) => {
                const player = event.currentTarget
                if (player.currentTime > 0 && player.duration > 0 && player.currentTime >= player.duration - 0.25) setVideoWatched(true)
              }}
            />
          ) : (
            <p className="muted">Ролик ещё не загружен.</p>
          )}
          {watched ? (
            <button className="primary add" type="button" onClick={() => testRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              К тесту
            </button>
          ) : (
            <p className="muted deck-note">Тест откроется после просмотра ролика.</p>
          )}
        </div>
      )}
      {lesson && watched && (
        <form className="lesson-test" ref={testRef} onSubmit={submit}>
          <h2>Тест</h2>
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
              Результат: {result.score} из {result.total}
              {result.repeated ? ' · показан сохранённый результат' : ''}
            </p>
          )}
          {locked ? (
            <p className="muted">Тест пройден. Повторная отправка не предусмотрена.</p>
          ) : (
            <>
              {attemptsLeft != null && attemptsLeft > 0 && lesson.attempts && (
                <p className="muted">Осталось попыток: {attemptsLeft}</p>
              )}
              <button className="primary add" type="submit" disabled={pending}>
                {pending ? 'Отправка…' : result ? 'Проверить снова' : 'Проверить'}
              </button>
            </>
          )}
        </form>
      )}
    </section>
  )
}

function FitLegend({ children }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    const parent = el?.parentElement
    if (!el || !parent) return undefined
    const fit = () => {
      const available = parent.clientWidth
      if (el.dataset.available === String(available)) return
      el.style.width = '100%'
      const max = el.offsetWidth
      const height = el.offsetHeight
      let low = 0
      let high = max
      while (low + 1 < high) {
        const mid = Math.floor((low + high) / 2)
        el.style.width = `${mid}px`
        if (el.offsetHeight > height) low = mid
        else high = mid
      }
      el.style.width = `${high}px`
      el.dataset.available = String(available)
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [children])
  return <legend ref={ref}>{children}</legend>
}

function Slide({ slide }) {
  const picture = slide.imageUrl || slide.dataUrl
  if (slide.kind === 'image') {
    return (
      <figure className="slide slide-image">
        {picture && <img src={picture} alt={slide.caption || 'Слайд'} />}
        {slide.caption && <figcaption>{slide.caption}</figcaption>}
      </figure>
    )
  }
  return (
    <article className={`slide ${slide.tone || 'orbit'}`}>
      {slide.kicker && <p className="slide-kicker">{slide.kicker}</p>}
      <h2>{slide.title}</h2>
      <ul>
        {slide.lines.map((line) => <li key={line}>{line}</li>)}
      </ul>
      {picture && <img className="slide-picture" src={picture} alt="" />}
    </article>
  )
}
