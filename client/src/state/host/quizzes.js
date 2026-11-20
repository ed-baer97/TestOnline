import { useEffect, useState } from 'react'
import { api } from '../../api/index.js'
import { newId } from '../../lib/ids.js'
import { useI18n } from '../i18n.jsx'
import { saveHostToken } from '../roomTokens.js'

function quizzesInLang(quizzes, lang) {
  if (quizzes == null) return null
  return quizzes.filter((quiz) => (quiz.lang || 'ru') === lang)
}

export function blankQuestion() {
  return {
    id: newId(),
    text: '',
    timeLimit: 20,
    correctIndex: 0,
    options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
  }
}

export function useQuizList(navigate, { classLaunch = false } = {}) {
  const { lang } = useI18n()
  const [quizzes, setQuizzes] = useState(null)
  const [orgs, setOrgs] = useState(null)
  const [account, setAccount] = useState('')
  const [error, setError] = useState('')

  async function load() {
    const [quizData, me] = await Promise.all([api.quizzes(), api.me()])
    setQuizzes(quizData.quizzes)
    setAccount(me.login || '')
  }

  useEffect(() => {
    load().catch((err) => setError(err.message))
    if (!classLaunch) return undefined
    api.launchTargets().then((data) => setOrgs(data.organizations)).catch(() => setOrgs([]))
    return undefined
  }, [classLaunch])

  async function start(id, options = {}) {
    setError('')
    try {
      const body = options?.mode === 'private'
        ? { quizId: id, mode: 'private', organizationId: options.organizationId, classId: options.classId }
        : { quizId: id, mode: 'public' }
      const room = await api.createRoom(body)
      saveHostToken(room.code, room.hostToken)
      navigate(`/host/room/${room.code}`)
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(quiz) {
    setError('')
    try {
      await api.deleteQuiz(quiz.id)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const visible = quizzesInLang(quizzes, lang)
  const hiddenByLang = Boolean(quizzes?.length && visible?.length === 0)
  return { quizzes: visible, hiddenByLang, orgs, account, error, start, remove }
}

export function useQuizLaunch(navigate) {
  const { lang } = useI18n()
  const [quizzes, setQuizzes] = useState(null)
  const [orgs, setOrgs] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.launchQuizzes(), api.launchTargets()])
      .then(([quizData, targetData]) => {
        setQuizzes(quizData.quizzes)
        setOrgs(targetData.organizations || [])
      })
      .catch((err) => setError(err.message))
  }, [])

  async function start({ quizId, organizationId, classId }) {
    setError('')
    try {
      const room = await api.createRoom({ quizId, mode: 'private', organizationId, classId })
      saveHostToken(room.code, room.hostToken)
      navigate(`/host/room/${room.code}`)
    } catch (err) {
      setError(err.message)
    }
  }

  const visible = quizzesInLang(quizzes, lang)
  const hiddenByLang = Boolean(quizzes?.length && visible?.length === 0)
  return { quizzes: visible, hiddenByLang, orgs, error, start }
}

// Редактор квиза по адресу /host/quiz/new создаёт квиз при первом сохранении и подменяет адрес на /host/quiz/:id.
export function useQuizEditor(id, navigate, editorBase = '/host/quiz') {
  const { lang } = useI18n()
  // /host/quiz/new передаёт id «new», а /admin/quizzes/new — отдельный маршрут без параметра.
  const isNew = !id || id === 'new'
  const [title, setTitle] = useState('')
  const [questions, setQuestions] = useState([blankQuestion()])
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [ready, setReady] = useState(isNew)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    if (isNew) return undefined
    api.quiz(id).then((quiz) => {
      setTitle(quiz.title)
      setQuestions(quiz.questions.map(padOptions))
      setReady(true)
    }).catch((err) => setError(err.message))
    return undefined
  }, [id, isNew])

  function updateQuestion(index, patch) {
    setQuestions((current) => current.map((question, i) => (i === index ? { ...question, ...patch } : question)))
  }

  function updateOption(questionIndex, optionIndex, text) {
    setQuestions((current) => current.map((question, i) => {
      if (i !== questionIndex) return question
      const options = question.options.map((option, j) => (j === optionIndex ? { text } : option))
      return { ...question, options }
    }))
  }

  function move(index, direction) {
    setQuestions((current) => {
      const next = [...current]
      const target = index + direction
      if (target < 0 || target >= next.length) return current
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  async function save(stay = true) {
    setError('')
    setSaved('')
    const body = isNew ? { title, questions, lang } : { title, questions }
    try {
      const quiz = isNew ? await api.createQuiz(body) : await api.updateQuiz(id, body)
      setSaved('Сохранено')
      if (isNew && stay) navigate(`${editorBase}/${quiz.id}`, { replace: true })
      return quiz
    } catch (err) {
      setError(err.message)
      return null
    }
  }

  function padOptions(question) {
    return {
      ...question,
      options: [...question.options, { text: '' }, { text: '' }, { text: '' }, { text: '' }].slice(0, 4),
    }
  }

  async function loadExcel(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || importing) return
    setError('')
    setSaved('')
    setImporting(true)
    try {
      const data = await api.importQuestions(file)
      setQuestions(data.questions.map(padOptions))
      if (title.trim().length < 2) {
        const name = file.name.replace(/\.xlsx$/i, '').trim()
        if (name.length >= 2) setTitle(name)
      }
      setSaved(`Загружено вопросов: ${data.questions.length}. Время ответа — 20 секунд, его можно изменить.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  async function saveAndStart() {
    const quiz = await save(false)
    if (!quiz) return
    try {
      const room = await api.createRoom(quiz.id)
      saveHostToken(room.code, room.hostToken)
      navigate(`/host/room/${room.code}`)
    } catch (err) {
      setError(err.message)
    }
  }

  return {
    title,
    setTitle,
    questions,
    setQuestions,
    error,
    saved,
    ready,
    importing,
    updateQuestion,
    updateOption,
    move,
    save,
    loadExcel,
    saveAndStart,
  }
}
