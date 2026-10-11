import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeAccount } from '../src/domain/accounts.js'
import { normalizeQuiz, scorePoints } from '../src/domain/quiz.js'

test('быстрый верный ответ стоит 1000, медленный 500', () => {
  assert.equal(scorePoints(0, 20), 1000)
  assert.equal(scorePoints(10000, 20), 750)
  assert.equal(scorePoints(20000, 20), 500)
  assert.equal(scorePoints(99999, 20), 500)
})

test('квиз без правильного ответа не сохраняется', () => {
  assert.throws(
    () => normalizeQuiz({
      title: 'Проверка',
      questions: [{ text: 'Два плюс два?', timeLimit: 10, correctIndex: 5, options: [{ text: '4' }, { text: '5' }] }],
    }),
    /правильный ответ/,
  )
})

test('короткий пароль и пустой логин не проходят регистрацию', () => {
  assert.throws(() => normalizeAccount({ login: 'ab', password: '123456' }), /Логин/)
  assert.throws(() => normalizeAccount({ login: 'анна', password: '123' }), /Пароль/)
  assert.equal(normalizeAccount({ login: ' Анна ', password: 'secret' }).login, 'Анна')
})

test('пустые варианты отбрасываются до проверки числа ответов', () => {
  const quiz = normalizeQuiz({
    title: 'Короткий',
    questions: [{
      text: 'Цвет неба?',
      timeLimit: 20,
      correctIndex: 1,
      options: [{ text: '' }, { text: 'Синий' }, { text: 'Зелёный' }, { text: '' }],
    }],
  })
  assert.equal(quiz.questions[0].options[0].text, 'Синий')
  assert.equal(quiz.questions[0].correctIndex, 0)
})
