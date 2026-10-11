import crypto from 'node:crypto'
import * as lessonsRepo from '../../repositories/lessons.js'

const DEMO_KEY = 'solar-system'

const DEMO_SLIDES = [
  {
    id: 'sun',
    kind: 'frame',
    tone: 'sun',
    kicker: 'Слайд 1',
    title: 'Солнечная система',
    lines: [
      'Вокруг Солнца движутся восемь планет.',
      'Они удерживаются его притяжением и светят отражённым светом.',
    ],
  },
  {
    id: 'center',
    kind: 'frame',
    tone: 'orbit',
    kicker: 'Слайд 2',
    title: 'Звезда в центре',
    lines: [
      'Солнце — звезда, а не планета.',
      'Оно даёт планетам свет и тепло.',
    ],
  },
  {
    id: 'order',
    kind: 'frame',
    tone: 'planets',
    kicker: 'Слайд 3',
    title: 'Порядок планет',
    lines: [
      'От Солнца: Меркурий, Венера, Земля, Марс.',
      'Дальше: Юпитер, Сатурн, Уран и Нептун.',
    ],
  },
  {
    id: 'earth',
    kind: 'frame',
    tone: 'earth',
    kicker: 'Слайд 4',
    title: 'Наша планета',
    lines: [
      'Земля — третья планета от Солнца.',
      'На ней есть вода и воздух, поэтому здесь живут люди, животные и растения.',
    ],
  },
]

const DEMO_QUESTIONS = [
  {
    id: 'planets',
    text: 'Сколько планет вращается вокруг Солнца?',
    options: [{ text: '8' }, { text: '7' }, { text: '9' }, { text: '10' }],
    correctIndex: 0,
  },
  {
    id: 'center',
    text: 'Что находится в центре Солнечной системы?',
    options: [{ text: 'Солнце' }, { text: 'Земля' }, { text: 'Луна' }, { text: 'Марс' }],
    correctIndex: 0,
  },
  {
    id: 'third',
    text: 'Какая планета третья от Солнца?',
    options: [{ text: 'Земля' }, { text: 'Венера' }, { text: 'Марс' }, { text: 'Юпитер' }],
    correctIndex: 0,
  },
  {
    id: 'closest',
    text: 'Какая планета ближе всех к Солнцу?',
    options: [{ text: 'Меркурий' }, { text: 'Венера' }, { text: 'Земля' }, { text: 'Марс' }],
    correctIndex: 0,
  },
]

export async function ensureDemoLesson() {
  const existing = await lessonsRepo.findSeededLesson(DEMO_KEY)
  if (existing) return existing.id
  if ((await lessonsRepo.countLessons()) > 0) return null
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  await lessonsRepo.insertSeedLesson({
    id,
    title: 'Солнечная система',
    seedKey: DEMO_KEY,
    slides: DEMO_SLIDES,
    questions: DEMO_QUESTIONS,
    createdAt: now,
    updatedAt: now,
  })
  return id
}
