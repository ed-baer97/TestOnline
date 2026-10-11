import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/index.js'
import { saveHostToken } from '../state/roomTokens.js'
import { HostFrame } from './HostFrame.jsx'

export default function Quizzes({ onLogout }) {
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
      saveHostToken(room.code, room.hostToken)
      navigate(`/host/room/${room.code}`)
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(quiz) {
    if (!window.confirm(`Удалить «${quiz.title}»?`)) return
    await api.deleteQuiz(quiz.id)
    await load()
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
              <button className="ghost" type="button" onClick={() => remove(quiz)}>Удалить</button>
            </div>
          </article>
        ))}
      </div>
    </HostFrame>
  )
}
