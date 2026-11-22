import { useEffect, useState } from 'react'
import { api } from '../api/index.js'

// Проверяет, на каком языке заблокирован пройденный тест относительно выбранного языка просмотра.
export function lessonLockState(result, viewLang) {
  const locked = Boolean(result?.attempts?.locked)
  const lockedLang = locked && result?.lang ? result.lang : null
  const lockedOtherLang = Boolean(locked && lockedLang && lockedLang !== viewLang)
  const sameLangResult = Boolean(result && (!result.lang || result.lang === viewLang))
  return { locked, lockedLang, lockedOtherLang, sameLangResult }
}

export function lessonTestState(questions, answers, currentIndex) {
  const list = Array.isArray(questions) ? questions : []
  const total = list.length
  const questionIndex = total ? Math.min(Math.max(0, currentIndex), total - 1) : 0
  const currentQuestion = total ? list[questionIndex] : null
  const unansweredIndex = list.findIndex((question) => answers[question.id] == null)
  const answeredCount = list.filter((question) => answers[question.id] != null).length
  const allAnswered = total > 0 && unansweredIndex === -1
  return { questionIndex, totalQuestions: total, currentQuestion, unansweredIndex, answeredCount, allAnswered }
}

// Тест открывается после всех слайдов или всего ролика; когда попытки исчерпаны, сразу виден последний результат.
export function useLessonView(id, viewLang = 'ru') {
  const [lesson, setLesson] = useState(null)
  const [error, setError] = useState('')
  const [index, setIndex] = useState(0)
  const [seen, setSeen] = useState(() => new Set([0]))
  const [videoWatched, setVideoWatched] = useState(false)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let alive = true
    setError('')
    setLesson(null)
    setIndex(0)
    setSeen(new Set([0]))
    setVideoWatched(false)
    setQuestionIndex(0)
    setAnswers({})
    setResult(null)
    api.lesson(id, viewLang).then((data) => {
      if (!alive) return
      setLesson(data)
      const last = data.attempts?.last
      if (data.attempts?.locked && last) {
        setResult({ ...last, attempts: data.attempts })
        if (last.results && (!last.lang || last.lang === viewLang)) {
          const picked = {}
          for (const item of last.results) if (item.chosen >= 0) picked[item.questionId] = item.chosen
          setAnswers(picked)
        }
      }
    }).catch((err) => { if (alive) setError(err.message) })
    return () => { alive = false }
  }, [id, viewLang])

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
      if (!lesson || !lesson.available || lesson.format === 'video' || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key === 'ArrowRight') showSlide(Math.min(lesson.slides.length - 1, index + 1))
      if (event.key === 'ArrowLeft') showSlide(Math.max(0, index - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lesson, index])

  async function submit(event) {
    event.preventDefault()
    if (!lesson || !lesson.available || pending || locked) return
    const missing = lesson.questions.findIndex((question) => answers[question.id] == null)
    if (missing >= 0) {
      setQuestionIndex(missing)
      setError('Ответьте на все вопросы')
      return
    }
    setError('')
    setPending(true)
    try {
      const data = await api.checkLesson(id, lesson.questions.map((question) => ({
        questionId: question.id,
        optionIndex: answers[question.id],
      })), viewLang)
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setPending(false)
    }
  }

  const available = Boolean(lesson?.available)
  const languages = lesson?.languages || { ru: false, kk: false }
  const isVideo = lesson?.format === 'video'
  const slide = !isVideo ? lesson?.slides[index] : null
  const last = lesson?.slides?.length ? lesson.slides.length - 1 : 0
  const { locked, lockedLang, lockedOtherLang, sameLangResult } = lessonLockState(result, viewLang)
  const watched = (locked && !lockedOtherLang) || (isVideo ? videoWatched : Boolean(lesson?.slides?.length) && seen.size > last)
  const byQuestion = new Map((sameLangResult ? result?.results || [] : []).map((item) => [item.questionId, item]))
  const attemptsLeft = result?.attempts ? result.attempts.max - result.attempts.used : lesson?.attempts ? lesson.attempts.max - lesson.attempts.used : null
  const testStep = lessonTestState(lesson?.questions, answers, questionIndex)

  function chooseAnswer(questionId, optionIndex) {
    if (locked) return
    setAnswers((current) => ({ ...current, [questionId]: optionIndex }))
    setResult(null)
    setError('')
  }

  return {
    lesson,
    available,
    languages,
    error,
    index,
    seen,
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
    lockedLang,
    lockedOtherLang,
    watched,
    byQuestion,
    attemptsLeft,
    ...testStep,
    setQuestionIndex,
    chooseAnswer,
  }
}
