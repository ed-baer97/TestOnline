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

const DEMO_SLIDES_KK = [
  {
    id: 'sun',
    kind: 'frame',
    tone: 'sun',
    kicker: '1-слайд',
    title: 'Күн жүйесі',
    lines: [
      'Күннің айналасында сегіз ғаламшар қозғалады.',
      'Оларды Күннің тартылысы ұстап тұрады, олар шағылған жарықпен жарқырайды.',
    ],
  },
  {
    id: 'center',
    kind: 'frame',
    tone: 'orbit',
    kicker: '2-слайд',
    title: 'Ортадағы жұлдыз',
    lines: [
      'Күн — ғаламшар емес, жұлдыз.',
      'Ол ғаламшарларға жарық пен жылу береді.',
    ],
  },
  {
    id: 'order',
    kind: 'frame',
    tone: 'planets',
    kicker: '3-слайд',
    title: 'Ғаламшарлар реті',
    lines: [
      'Күннен бастап: Меркурий, Шолпан, Жер, Марс.',
      'Әрі қарай: Юпитер, Сатурн, Уран және Нептун.',
    ],
  },
  {
    id: 'earth',
    kind: 'frame',
    tone: 'earth',
    kicker: '4-слайд',
    title: 'Біздің ғаламшар',
    lines: [
      'Жер — Күннен үшінші ғаламшар.',
      'Онда су мен ауа бар, сондықтан мұнда адамдар, жануарлар және өсімдіктер тіршілік етеді.',
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

const DEMO_QUESTIONS_KK = [
  {
    id: 'planets',
    text: 'Күннің айналасында неше ғаламшар айналады?',
    options: [{ text: '8' }, { text: '7' }, { text: '9' }, { text: '10' }],
    correctIndex: 0,
  },
  {
    id: 'center',
    text: 'Күн жүйесінің ортасында не бар?',
    options: [{ text: 'Күн' }, { text: 'Жер' }, { text: 'Ай' }, { text: 'Марс' }],
    correctIndex: 0,
  },
  {
    id: 'third',
    text: 'Күннен үшінші ғаламшар қайсысы?',
    options: [{ text: 'Жер' }, { text: 'Шолпан' }, { text: 'Марс' }, { text: 'Юпитер' }],
    correctIndex: 0,
  },
  {
    id: 'closest',
    text: 'Күнге ең жақын ғаламшар қайсысы?',
    options: [{ text: 'Меркурий' }, { text: 'Шолпан' }, { text: 'Жер' }, { text: 'Марс' }],
    correctIndex: 0,
  },
]

export async function ensureDemoLesson() {
  const existing = await lessonsRepo.findSeededLesson(DEMO_KEY)
  if (existing) {
    await lessonsRepo.fillSeedLessonKazakh(existing.id, {
      titleKk: 'Күн жүйесі',
      slidesKk: DEMO_SLIDES_KK,
      questionsKk: DEMO_QUESTIONS_KK,
    })
    return existing.id
  }
  if ((await lessonsRepo.countLessons()) > 0) return null
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  await lessonsRepo.insertSeedLesson({
    id,
    title: 'Солнечная система',
    titleKk: 'Күн жүйесі',
    seedKey: DEMO_KEY,
    slides: DEMO_SLIDES,
    questions: DEMO_QUESTIONS,
    slidesKk: DEMO_SLIDES_KK,
    questionsKk: DEMO_QUESTIONS_KK,
    createdAt: now,
    updatedAt: now,
  })
  return id
}
