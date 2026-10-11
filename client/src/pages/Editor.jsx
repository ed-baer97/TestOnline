import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/index.js'
import { COLOR_NAMES } from '../components/shapes.jsx'
import { newId } from '../lib/ids.js'
import { saveHostToken } from '../state/roomTokens.js'

function blankQuestion() {
  return {
    id: newId(),
    text: '',
    timeLimit: 20,
    correctIndex: 0,
    options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
  }
}

export default function Editor({ onLogout }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = id === 'new'
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
      if (isNew && stay) navigate(`/host/quiz/${quiz.id}`, { replace: true })
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
    const room = await api.createRoom(quiz.id)
    saveHostToken(room.code, room.hostToken)
    navigate(`/host/room/${room.code}`)
  }

  if (!ready && !error) return <p className="center muted">Загрузка…</p>

  return (
    <main className="sheet editor">
      <header className="topbar">
        <Link className="brand" to="/host">TestOnline</Link>
        <div className="top-actions">
          <button className="ghost" type="button" onClick={save}>Сохранить</button>
          <button className="primary" type="button" onClick={saveAndStart}>Запустить</button>
          <button className="ghost" type="button" onClick={onLogout}>Выйти</button>
        </div>
      </header>
      <label className="title-field">
        Название квиза
        <input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} placeholder="География, 7 класс" />
      </label>
      <div className="import-row">
          <label className="excel file-button">
            {importing ? 'Читаем файл…' : 'Загрузить Excel'}
            <input className="sr-only" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={loadExcel} />
          </label>
          <a className="excel" href="/api/template">Скачать шаблон</a>
        <p className="muted">Каждая строка — вопрос. Первый столбец — текст, дальше варианты. Залейте правильный ответ любым цветом, кроме белого.</p>
      </div>
      {error && <p className="form-error">{error}</p>}
      {saved && <p className="saved">{saved}</p>}
      {questions.map((question, index) => (
        <section className="card question-card" key={question.id}>
          <header>
            <h2>Вопрос {index + 1}</h2>
            <div className="top-actions">
              <button className="ghost" type="button" onClick={() => move(index, -1)} disabled={index === 0}>Выше</button>
              <button className="ghost" type="button" onClick={() => move(index, 1)} disabled={index === questions.length - 1}>Ниже</button>
              <button className="ghost" type="button" onClick={() => setQuestions((current) => current.filter((item) => item.id !== question.id))} disabled={questions.length === 1}>Удалить</button>
            </div>
          </header>
          <label>
            Текст
            <textarea value={question.text} maxLength={200} onChange={(event) => updateQuestion(index, { text: event.target.value })} />
          </label>
          <label>
            Секунд на ответ
            <select value={question.timeLimit} onChange={(event) => updateQuestion(index, { timeLimit: Number(event.target.value) })}>
              {[10, 20, 30, 60].map((seconds) => <option key={seconds} value={seconds}>{seconds}</option>)}
            </select>
          </label>
          <div className="option-edit">
            {question.options.map((option, optionIndex) => (
              <label key={optionIndex} className={`option-line ${COLOR_NAMES[optionIndex]}`}>
                <input
                  type="radio"
                  name={`correct-${question.id}`}
                  checked={question.correctIndex === optionIndex}
                  onChange={() => updateQuestion(index, { correctIndex: optionIndex })}
                />
                <input
                  value={option.text}
                  maxLength={80}
                  placeholder={`Вариант ${optionIndex + 1}`}
                  onChange={(event) => updateOption(index, optionIndex, event.target.value)}
                />
              </label>
            ))}
          </div>
          <p className="muted">Отметьте кружком правильный ответ. Пустые поля не попадут в игру.</p>
        </section>
      ))}
      <button className="ghost add" type="button" onClick={() => setQuestions((current) => [...current, blankQuestion()])}>Добавить вопрос</button>
    </main>
  )
}
