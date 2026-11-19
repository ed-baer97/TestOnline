import { Link, useNavigate } from 'react-router-dom'
import { HostFrame } from '../../components/layout/HostFrame.jsx'
import { useQuizList } from '../../state/host/quizzes.js'
import { useI18n } from '../../state/i18n.jsx'

export default function Quizzes({ onLogout }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { quizzes, account, error, start, remove } = useQuizList(navigate)

  function confirmRemove(quiz) {
    if (window.confirm(t('Удалить «{name}»?', { name: quiz.title }))) remove(quiz)
  }

  return (
    <HostFrame onLogout={onLogout} account={account} title={t('Квизы')}>
      {error && <p className="form-error">{t(error)}</p>}
      {quizzes === null && !error && <p className="muted">{t('Загрузка…')}</p>}
      {quizzes?.length === 0 && <p className="muted">{t('Пока нет квизов. Создайте первый.')}</p>}
      <div className="quiz-list">
        {quizzes?.map((quiz) => (
          <article className="card quiz-card" key={quiz.id}>
            <div>
              <h2>{quiz.title}</h2>
              <p className="muted">{t('{count} вопр.', { count: quiz.questionCount })}</p>
            </div>
            <div className="top-actions">
              <button className="primary" type="button" data-testid="start-quiz" onClick={() => start(quiz.id)}>{t('Запустить')}</button>
              <Link to={`/host/quiz/${quiz.id}/stats`}>{t('Статистика')}</Link>
              <Link to={`/host/quiz/${quiz.id}`}>{t('Править')}</Link>
              <button className="ghost" type="button" onClick={() => confirmRemove(quiz)}>{t('Удалить')}</button>
            </div>
          </article>
        ))}
      </div>
    </HostFrame>
  )
}
