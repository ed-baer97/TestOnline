import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, hostKey } from '../api.js'
import { useI18n } from '../i18n.jsx'
import { HostFrame } from './HostFrame.jsx'

export default function Quizzes({ onLogout }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [quizzes, setQuizzes] = useState(null)
  const [account, setAccount] = useState('')
  const [error, setError] = useState('')

  async function load() {
    const [quizData, me] = await Promise.all([api.quizzes(), api.me()])
    setQuizzes(quizData.quizzes)
    setAccount(me.login || '')
  }

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [])

  async function start(id) {
    setError('')
    try {
      const room = await api.createRoom(id)
      sessionStorage.setItem(hostKey(room.code), room.hostToken)
      navigate(`/host/room/${room.code}`)
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(quiz) {
    if (!window.confirm(t('Удалить «{name}»?', { name: quiz.title }))) return
    await api.deleteQuiz(quiz.id)
    await load()
  }

  return (
    <HostFrame onLogout={onLogout} account={account} title="Квизы">
      {error && <p className="form-error">{t(error)}</p>}
      {quizzes === null && <p className="muted">{t('Загрузка…')}</p>}
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
              <button className="ghost" type="button" onClick={() => remove(quiz)}>{t('Удалить')}</button>
            </div>
          </article>
        ))}
      </div>
    </HostFrame>
  )
}
