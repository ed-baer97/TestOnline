import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeAccount, normalizeQuiz, scorePoints } from './domain.js'

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

test('вариант длиннее 80 символов сохраняется, длиннее 400 — нет', () => {
  const long = 'Отказаться, отойти и сразу рассказать родителям или учителю, даже если он кажется добрым'
  assert.ok(long.length > 80)
  const quiz = normalizeQuiz({
    title: 'Длинный',
    questions: [{
      text: 'Что делать?',
      timeLimit: 20,
      correctIndex: 0,
      options: [{ text: long }, { text: 'Согласиться' }],
    }],
  })
  assert.equal(quiz.questions[0].options[0].text, long)
  assert.throws(
    () => normalizeQuiz({
      title: 'Длинный',
      questions: [{
        text: 'Что делать?',
        timeLimit: 20,
        correctIndex: 0,
        options: [{ text: 'А'.repeat(401) }, { text: 'Согласиться' }],
      }],
    }),
    /вариант длиннее 400/,
  )
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
