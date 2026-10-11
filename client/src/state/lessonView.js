import { useEffect, useState } from 'react'
import { api } from '../api/index.js'

// Тест открывается после всех слайдов или всего ролика; когда попытки исчерпаны, сразу виден последний результат.
export function useLessonView(id) {
  const [lesson, setLesson] = useState(null)
  const [error, setError] = useState('')
  const [index, setIndex] = useState(0)
  const [seen, setSeen] = useState(() => new Set([0]))
  const [videoWatched, setVideoWatched] = useState(false)
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [pending, setPending] = useState(false)

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

  return {
    lesson,
    error,
    index,
    answers,
    setAnswers,
    result,
    setResult,
    pending,
    setVideoWatched,
    showSlide,
    submit,
    isVideo,
    slide,
    last,
    locked,
    watched,
    byQuestion,
    attemptsLeft,
  }
}
