import { Link, useNavigate, useParams } from 'react-router-dom'
import { Brand } from '../../components/Brand.jsx'
import { EnvControls } from '../../components/layout/topbar.jsx'
import { COLOR_NAMES } from '../../components/shapes.jsx'
import { blankQuestion, useQuizEditor } from '../../state/host/quizzes.js'
import { useI18n } from '../../state/i18n.jsx'

function QuizActions({ save, saveAndStart }) {
  const { t } = useI18n()
  return (
    <>
      <button className="ghost" type="button" onClick={() => save()}>{t('Сохранить')}</button>
      <button className="primary" type="button" onClick={saveAndStart}>{t('Запустить')}</button>
    </>
  )
}

export default function Editor({ onLogout, embedded = false }) {
  const { t } = useI18n()
  const { id } = useParams()
  const navigate = useNavigate()
  const editorBase = embedded ? '/admin/quizzes' : '/host/quiz'
  const {
    title, setTitle, questions, setQuestions, error, saved, ready, importing,
    updateQuestion, updateOption, move, save, loadExcel, saveAndStart,
  } = useQuizEditor(id, navigate, editorBase)

  if (!ready && !error) return <p className="center muted">{t('Загрузка…')}</p>

  const fields = (
    <>
      <label className="title-field">
        {t('Название квиза')}
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('География, 7 класс')} />
      </label>
      <div className="import-row">
        <label className="excel file-button">
          {t(importing ? 'Читаем файл…' : 'Загрузить Excel')}
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
              <label key={optionIndex} className={`option-line ${COLOR_NAMES[optionIndex]}`}>
                <input
                  type="radio"
                  name={`correct-${question.id}`}
                  checked={question.correctIndex === optionIndex}
                  onChange={() => updateQuestion(index, { correctIndex: optionIndex })}
                />
                <input
                  value={option.text}
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
          <h1>{t(!id || id === 'new' ? 'Новый квиз' : 'Квиз')}</h1>
          <div className="row-actions">
            <Link className="ghost" to="/admin/quizzes">{t('К списку')}</Link>
            <QuizActions save={save} saveAndStart={saveAndStart} />
          </div>
        </div>
        {fields}
      </section>
    )
  }

  return (
    <main className="sheet editor">
      <header className="topbar">
        <Brand to="/host" />
        <div className="top-actions">
          <QuizActions save={save} saveAndStart={saveAndStart} />
          <EnvControls />
          <button className="ghost" type="button" onClick={onLogout}>{t('Выйти')}</button>
        </div>
      </header>
      {fields}
    </main>
  )
}
