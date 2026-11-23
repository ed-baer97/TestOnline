import assert from 'node:assert/strict'
import test from 'node:test'
import { allocateUniqueLogin, loginBaseFromName, normalizeAccount, normalizeEmail, parseFioLines } from '../src/domain/accounts.js'
import { MAX_VIDEO } from '../src/domain/lesson.js'
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

test('логин — от 3 символов латиницей, пароль — от 6 символов', () => {
  assert.throws(() => normalizeAccount({ login: 'ab', password: '123456' }), /Логин/)
  assert.throws(() => normalizeAccount({ login: 'анна', password: '123456' }), (error) => error.status === 400 && /латинские/.test(error.message))
  assert.throws(() => normalizeAccount({ login: 'anna', password: '123' }), /Пароль/)
  assert.equal(normalizeAccount({ login: ' Anna.K ', password: 'secret' }).login, 'Anna.K')
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

test('максимальный размер видео — 250 МБ', () => {
  assert.equal(MAX_VIDEO, 250 * 1024 * 1024)
})

test('генерация базового логина из ФИО на русском и казахском', () => {
  assert.equal(loginBaseFromName('Иванов Иван Иванович'), 'ivanov.ivan')
  assert.equal(loginBaseFromName('Қасымова Аида Серікқызы'), 'qasymova.aida')
  assert.equal(loginBaseFromName('Өмірзақ Ғалымжан Ұланұлы'), 'omirzaq.galymzhan')
  assert.equal(loginBaseFromName('Щукина Юлия'), 'shchukina.yuliya')
  assert.equal(loginBaseFromName('А. Б. Иванов'), 'a.b.ivanov')
  assert.equal(loginBaseFromName('Ли'), 'user.li')
  assert.equal(loginBaseFromName('ъь---'), 'user')
  const longBase = loginBaseFromName('Абдрахманов-Сулейманов Константин Александрович')
  assert.ok(longBase.length <= 26)
  assert.ok(!longBase.endsWith('.'))
  assert.match(longBase, /^[a-z0-9][a-z0-9._-]{2,31}$/)
})

test('выделение уникального логина с нумерацией и длиной до 32 символов', () => {
  const taken = new Set(['ivanov.ivan', 'ivanov.ivan2'])
  assert.equal(allocateUniqueLogin('ivanov.ivan', taken), 'ivanov.ivan3')
  assert.equal(allocateUniqueLogin('ivanov.ivan', taken), 'ivanov.ivan4')

  const longRoot = 'a'.repeat(26)
  const boundaryTaken = new Set([longRoot])
  const allocated = allocateUniqueLogin(longRoot, boundaryTaken)
  assert.equal(allocated, `${longRoot}2`)
  assert.ok(allocated.length <= 32)

  const maxRoot = 'a'.repeat(32)
  const maxTaken = new Set([maxRoot])
  const truncated = allocateUniqueLogin(maxRoot, maxTaken)
  assert.equal(truncated, `${'a'.repeat(31)}2`)
  assert.equal(truncated.length, 32)
})

test('разбор текстового списка ФИО с номерами, маркерами и заголовком', () => {
  const parsed = parseFioLines([
    '',
    'ФИО',
    '1. Иванов Иван',
    '2) Петрова Анна',
    '• Сидоров Олег',
    '- Қасымова Аида\tСерікқызы',
    '   ',
  ].join('\n'))
  assert.deepEqual(parsed, [
    { lineNumber: 3, displayName: 'Иванов Иван' },
    { lineNumber: 4, displayName: 'Петрова Анна' },
    { lineNumber: 5, displayName: 'Сидоров Олег' },
    { lineNumber: 6, displayName: 'Қасымова Аида Серікқызы' },
  ])

  assert.deepEqual(parseFioLines('ФИО'), [{ lineNumber: 1, displayName: 'ФИО' }])
})

test('проверка и нормализация почты', () => {
  assert.equal(normalizeEmail('  Arman.Serikov@School.KZ '), 'arman.serikov@school.kz')
  for (const bad of ['', '   ', 'not-an-email', 'a@b', 'a b@c.kz', `${'a'.repeat(250)}@x.kz`]) {
    assert.throws(() => normalizeEmail(bad), /Укажите корректную почту/)
  }
})
