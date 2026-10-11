import { Link, useNavigate, useParams } from 'react-router-dom'
import { COLOR_NAMES } from '../../components/shapes.jsx'
import { blankQuestion, useQuizEditor } from '../../state/host/quizzes.js'

export default function Editor({ onLogout }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const {
    title, setTitle, questions, setQuestions, error, saved, ready, importing,
    updateQuestion, updateOption, move, save, loadExcel, saveAndStart,
  } = useQuizEditor(id, navigate)

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
