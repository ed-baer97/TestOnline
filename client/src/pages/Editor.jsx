import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, hostKey, newId } from '../api.js'
import { useI18n } from '../i18n.jsx'

function blankQuestion() {
  return {
    id: newId(),
    text: '',
    timeLimit: 20,
    correctIndex: 0,
    options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
  }
}

export default function Editor({ onLogout, embedded = false }) {
  const { t } = useI18n()
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id || id === 'new'
  const quizPath = (quizId) => (embedded ? `/admin/materials/quizzes/${quizId}` : `/host/quiz/${quizId}`)
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
    const body = { title, questions }
    try {
      const quiz = isNew ? await api.createQuiz(body) : await api.updateQuiz(id, body)
      setSaved('Сохранено')
      if (isNew && stay) navigate(quizPath(quiz.id), { replace: true })
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
        const name = file.name.replace(/\.xlsx$/i, '').trim().slice(0, 80)
        if (name.length >= 2) setTitle(name)
      }
      setSaved('Загружено вопросов: {count}. Время ответа — 20 секунд, его можно изменить.'.replace('{count}', data.questions.length))
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  async function saveAndStart() {
    const quiz = await save(false)
    if (!quiz) return
    const room = await api.createRoom(quiz.id)
    sessionStorage.setItem(hostKey(room.code), room.hostToken)
    navigate(`/host/room/${room.code}`)
  }

  if (!ready && !error) return <p className="center muted">{t('Загрузка…')}</p>

  const fields = (
    <>
      <label className="title-field">
        {t('Название квиза')}
        <input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} placeholder={t('География, 7 класс')} />
      </label>
      <div className="import-row">
          <label className="excel file-button">
            {importing ? t('Читаем файл…') : t('Загрузить Excel')}
            <input className="sr-only" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={loadExcel} />
          </label>
          <a className="excel" href="/api/template">{t('Скачать шаблон')}</a>
        <p className="muted">{t('Каждая строка — вопрос. Первый столбец — текст, дальше варианты. Залейте правильный ответ любым цветом, кроме белого.')}</p>
      </div>
      {error && <p className="form-error">{t(error)}</p>}
      {saved && <p className="saved">{t(saved)}</p>}
      {questions.map((question, index) => (
        <section className="card question-card" key={question.id}>
          <header>
            <h2>{t('Вопрос {n}', { n: index + 1 })}</h2>
            <div className="top-actions">
              <button className="ghost" type="button" onClick={() => move(index, -1)} disabled={index === 0}>{t('Выше')}</button>
              <button className="ghost" type="button" onClick={() => move(index, 1)} disabled={index === questions.length - 1}>{t('Ниже')}</button>
              <button className="ghost" type="button" onClick={() => setQuestions((current) => current.filter((item) => item.id !== question.id))} disabled={questions.length === 1}>{t('Удалить')}</button>
            </div>
          </header>
          <label>
            {t('Текст')}
            <textarea value={question.text} maxLength={200} onChange={(event) => updateQuestion(index, { text: event.target.value })} />
          </label>
          <label>
            {t('Секунд на ответ')}
            <select value={question.timeLimit} onChange={(event) => updateQuestion(index, { timeLimit: Number(event.target.value) })}>
              {[10, 20, 30, 60].map((seconds) => <option key={seconds} value={seconds}>{seconds}</option>)}
            </select>
          </label>
          <div className="option-edit">
            {question.options.map((option, optionIndex) => (
              <label key={optionIndex} className={`option-line ${COLOR_CLASS(optionIndex)}`}>
                <input
                  type="radio"
                  name={`correct-${question.id}`}
                  checked={question.correctIndex === optionIndex}
                  onChange={() => updateQuestion(index, { correctIndex: optionIndex })}
                />
                <input
                  value={option.text}
                  maxLength={400}
                  placeholder={t('Вариант {n}', { n: optionIndex + 1 })}
                  onChange={(event) => updateOption(index, optionIndex, event.target.value)}
                />
              </label>
            ))}
          </div>
          <p className="muted">{t('Отметьте кружком правильный ответ. Пустые поля не попадут в игру.')}</p>
        </section>
      ))}
      <button className="ghost add" type="button" onClick={() => setQuestions((current) => [...current, blankQuestion()])}>{t('Добавить вопрос')}</button>
    </>
  )

  if (embedded) {
    return (
      <section className="stack editor">
        <div className="section-head">
          <h1>{isNew ? t('Новый квиз') : t('Квиз')}</h1>
          <div className="row-actions">
            <Link className="ghost" to="/admin/materials/quizzes">{t('К квизам')}</Link>
            <button className="ghost" type="button" onClick={save}>{t('Сохранить')}</button>
            <button className="primary" type="button" onClick={saveAndStart}>{t('Запустить')}</button>
          </div>
        </div>
        {fields}
      </section>
    )
  }

  return (
    <main className="sheet editor">
      <header className="topbar">
        <Link className="brand" to="/host">Saqbol</Link>
        <div className="top-actions">
          <button className="ghost" type="button" onClick={save}>{t('Сохранить')}</button>
          <button className="primary" type="button" onClick={saveAndStart}>{t('Запустить')}</button>
          <button className="ghost" type="button" onClick={onLogout}>{t('Выйти')}</button>
        </div>
      </header>
      {fields}
    </main>
  )
}

function COLOR_CLASS(index) {
  return ['red', 'blue', 'yellow', 'green'][index]
}
