import { Link, useNavigate } from 'react-router-dom'
import { useQuizList } from '../../state/host/quizzes.js'
import { HostFrame } from '../../components/layout/HostFrame.jsx'

export default function Quizzes({ onLogout }) {
  const navigate = useNavigate()
  const { quizzes, account, error, start, remove } = useQuizList(navigate)

  function confirmRemove(quiz) {
    if (window.confirm(`Удалить «${quiz.title}»?`)) remove(quiz)
  }

  return (
    <HostFrame onLogout={onLogout} account={account} title="Квизы">
      {error && <p className="form-error">{error}</p>}
      {quizzes === null && <p className="muted">Загрузка…</p>}
      {quizzes?.length === 0 && <p className="muted">Пока нет квизов. Создайте первый.</p>}
      <div className="quiz-list">
        {quizzes?.map((quiz) => (
          <article className="card quiz-card" key={quiz.id}>
            <div>
              <h2>{quiz.title}</h2>
              <p className="muted">{quiz.questionCount} вопр.</p>
            </div>
            <div className="top-actions">
              <button className="primary" type="button" data-testid="start-quiz" onClick={() => start(quiz.id)}>Запустить</button>
              <Link to={`/host/quiz/${quiz.id}/stats`}>Статистика</Link>
              <Link to={`/host/quiz/${quiz.id}`}>Править</Link>
              <button className="ghost" type="button" onClick={() => confirmRemove(quiz)}>Удалить</button>
            </div>
          </article>
        ))}
      </div>
    </HostFrame>
  )
}
