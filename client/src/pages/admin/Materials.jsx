import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom'
import { api, newId } from '../../api.js'
import { BANDS, EMPTY_GROUPS } from '../../bands.js'
import { pick, useI18n } from '../../i18n.jsx'
import { QuizCatalog } from '../Quizzes.jsx'
import { GroupChecks, Notice } from './ui.jsx'

const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg']

const TONES = [
  { id: 'sun', label: 'Солнце' },
  { id: 'orbit', label: 'Орбита' },
  { id: 'planets', label: 'Планеты' },
  { id: 'earth', label: 'Земля' },
]

function serializeSlides(slides) {
  return slides.map((slide) => {
    if (slide.kind === 'frame') {
      const item = { id: slide.id, kind: 'frame', tone: slide.tone, kicker: slide.kicker, title: slide.title, lines: slide.lines }
      if (slide.imageFileId && !slide.dirty) item.imageFileId = slide.imageFileId
      else if (slide.dataUrl) item.dataUrl = slide.dataUrl
      return item
    }
    if (slide.dirty) return { id: slide.id, kind: 'image', caption: slide.caption, dataUrl: slide.dataUrl }
    return { id: slide.id, kind: 'image', caption: slide.caption, fileId: slide.fileId }
  })
}

function blankFrame() {
  return { id: newId(), kind: 'frame', tone: 'orbit', kicker: '', title: '', lines: [''] }
}

function blankQuestion() {
  return {
    id: newId(),
    text: '',
    correctIndex: 0,
    options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
  }
}

function emptyPack() {
  return { slides: [blankFrame()], questions: [blankQuestion()], videoFile: null, videoName: '', videoUrl: '' }
}

function packFrom(slides, questions, video, lessonId, lang) {
  const frames = slides?.length ? slides : [blankFrame()]
  const items = questions?.length ? questions : [blankQuestion()]
  return {
    slides: frames.map((slide) => (
      slide.kind === 'frame' ? { ...slide, lines: slide.lines?.length ? slide.lines : [''] } : { ...slide, dirty: false }
    )),
    questions: items.map((question) => ({
      ...question,
      options: [...question.options, { text: '' }, { text: '' }, { text: '' }, { text: '' }].slice(0, 4),
    })),
    videoFile: null,
    videoName: video?.name || '',
    videoUrl: video ? `/api/lessons/${lessonId}/media?lang=${lang}` : '',
  }
}

function packReady(pack, format) {
  const questions = pack.questions.some((question) => question.text.trim())
  if (format === 'video') return questions && Boolean(pack.videoFile || pack.videoName)
  const slides = pack.slides.some((slide) => (
    slide.kind === 'image' ? Boolean(slide.fileId || slide.dataUrl) : Boolean(slide.title.trim() || slide.lines.some((line) => line.trim()))
  ))
  return questions && slides
}

function MaterialTabs() {
  const { t } = useI18n()
  return (
    <nav className="host-tabs material-tabs" aria-label={t('Материалы')}>
      <NavLink to="/admin/materials" end>{t('Уроки')}</NavLink>
      <NavLink to="/admin/materials/quizzes">{t('Квизы')}</NavLink>
    </nav>
  )
}

export function MaterialList() {
  const { lang, t } = useI18n()
  const [lessons, setLessons] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.lessons().then((data) => setLessons(data.lessons)).catch((err) => setError(err.message))
  }, [])

  return (
    <section className="stack">
      <div className="section-head">
        <div>
          <h1>{t('Материалы')}</h1>
          <MaterialTabs />
        </div>
        <Link className="primary" to="/admin/materials/new">{t('Новый урок')}</Link>
      </div>
      {error && <p className="form-error">{t(error)}</p>}
      {lessons === null && !error && <p className="muted">{t('Загрузка…')}</p>}
      {lessons && (
        <div className="accordion">
          {BANDS.map((band) => {
            const items = lessons.filter((lesson) => lesson.groups?.[band.id])
            return (
              <details key={band.id} open>
                <summary>
                  {t(band.label)}
                  <span className="muted"> {items.length}</span>
                </summary>
                <div className="stack">
                  {items.length === 0 && <p className="muted">{t('Нет уроков')}</p>}
                  {items.map((lesson) => (
                    <article className="lesson-card" key={lesson.id}>
                      <div>
                        <h2>{pick(lang, lesson.title, lesson.titleKk)}</h2>
                        <p className="muted">{lesson.format === 'video' ? t('Видео · {count} вопр.', { count: lang === 'kk' && (lesson.questionCountKk || lesson.hasVideoKk) ? lesson.questionCountKk : lesson.questionCount }) : t('Презентация · {slides} сл. · {count} вопр.', { slides: lang === 'kk' && lesson.slideCountKk ? lesson.slideCountKk : lesson.slideCount, count: lang === 'kk' && lesson.questionCountKk ? lesson.questionCountKk : lesson.questionCount })}</p>
                      </div>
                      <div className="row-actions">
                        <Link className="primary" to={`/admin/materials/${lesson.id}/play`}>{t('Открыть')}</Link>
                        <Link className="ghost" to={`/admin/materials/${lesson.id}`}>{t('Изменить')}</Link>
                      </div>
                    </article>
                  ))}
                </div>
              </details>
            )
          })}
        </div>
      )}
    </section>
  )
}

export function MaterialQuizzes() {
  const { t } = useI18n()
  return (
    <section className="stack">
      <div className="section-head">
        <div>
          <h1>{t('Материалы')}</h1>
          <MaterialTabs />
        </div>
        <Link className="primary" to="/admin/materials/quizzes/new">{t('Новый квиз')}</Link>
      </div>
      <QuizCatalog editBase="/admin/materials/quizzes" classLaunch />
    </section>
  )
}

export function LessonEditor() {
  const { t } = useI18n()
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [titleKk, setTitleKk] = useState('')
  const [format, setFormat] = useState('slides')
  const [groups, setGroups] = useState({ ...EMPTY_GROUPS, grades_5_9: true })
  const [contentLang, setContentLang] = useState('ru')
  const [packs, setPacks] = useState(() => ({ ru: emptyPack(), kk: emptyPack() }))
  const savedId = useRef(id || null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [ready, setReady] = useState(isNew)
  const pack = packs[contentLang]
  const slides = pack.slides
  const questions = pack.questions
  const videoFile = pack.videoFile
  const videoName = pack.videoName
  const videoUrl = pack.videoUrl

  function setField(key, value) {
    setPacks((current) => {
      const prev = current[contentLang]
      const next = typeof value === 'function' ? value(prev[key]) : value
      return { ...current, [contentLang]: { ...prev, [key]: next } }
    })
  }

  const setSlides = (value) => setField('slides', value)
  const setQuestions = (value) => setField('questions', value)
  const setVideoFile = (value) => setField('videoFile', value)
  const setVideoName = (value) => setField('videoName', value)
  const setVideoUrl = (value) => setField('videoUrl', value)

  useEffect(() => {
    if (isNew) return undefined
    api.lesson(id).then((lesson) => {
      setTitle(lesson.title)
      setTitleKk(lesson.titleKk || '')
      setFormat(lesson.format === 'video' ? 'video' : 'slides')
      setGroups(lesson.groups)
      setPacks({
        ru: packFrom(lesson.slides, lesson.questions, lesson.video, lesson.id, 'ru'),
        kk: packFrom(lesson.slidesKk, lesson.questionsKk, lesson.videoKk, lesson.id, 'kk'),
      })
      setReady(true)
    }).catch((err) => setError(err.message))
    return undefined
  }, [id, isNew])

  function patchSlide(slideId, patch) {
    setSlides((current) => current.map((slide) => (slide.id === slideId ? { ...slide, ...patch } : slide)))
  }

  function moveSlide(slideId, direction) {
    setSlides((current) => {
      const index = current.findIndex((slide) => slide.id === slideId)
      const target = index + direction
      if (index < 0 || target < 0 || target >= current.length) return current
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  async function upload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    setNotice('')
    try {
      const data = await api.importPptx(file)
      const next = (data.slides || []).map((slide) => (
        slide.kind === 'frame'
          ? { ...slide, lines: slide.lines?.length ? slide.lines : [''], dirty: false }
          : { ...slide, dirty: false }
      ))
      if (!next.length) throw new Error('В презентации нет слайдов')
      setSlides(next)
      const fill = (current) => current.trim() || next.find((slide) => slide.title)?.title || current
      if (contentLang === 'kk') setTitleKk(fill)
      else setTitle(fill)
      setNotice(data.truncated ? t('В урок вошли первые {count} слайдов', { count: next.length }) : t('Загружено слайдов: {count}', { count: next.length }))
    } catch (err) {
      setError(err.message)
    }
  }

  function pickVideo(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const type = (file.type || '').split(';')[0].toLowerCase()
    if (!VIDEO_TYPES.includes(type)) {
      setError(t('Нужен ролик MP4, WebM, MOV или OGG'))
      return
    }
    if (file.size > 80 * 1024 * 1024) {
      setError(t('Видео больше 80 МБ'))
      return
    }
    setError('')
    if (videoUrl.startsWith('blob:')) URL.revokeObjectURL(videoUrl)
    setVideoFile(file)
    setVideoName(file.name)
    setVideoUrl(URL.createObjectURL(file))
  }

  async function save(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (title.trim().length < 2 || titleKk.trim().length < 2) {
      setError('Заполните название на русском и казахском')
      return
    }
    if (!packReady(packs.ru, format) || !packReady(packs.kk, format)) {
      setError(format === 'video' ? 'Загрузите ролик на русском и казахском' : 'Заполните презентацию и тест на русском и казахском')
      return
    }
    const body = {
      title,
      titleKk,
      format,
      groups,
      questions: packs.ru.questions,
      questionsKk: packs.kk.questions,
    }
    if (format === 'slides') {
      body.slides = serializeSlides(packs.ru.slides)
      body.slidesKk = serializeSlides(packs.kk.slides)
    }
    try {
      const lesson = savedId.current
        ? await api.updateLesson(savedId.current, body)
        : await api.createLesson(body)
      savedId.current = lesson.id
      if (format === 'video' && packs.ru.videoFile) await api.uploadLessonVideo(lesson.id, packs.ru.videoFile, 'ru')
      if (format === 'video' && packs.kk.videoFile) await api.uploadLessonVideo(lesson.id, packs.kk.videoFile, 'kk')
      setPacks((current) => ({
        ru: { ...current.ru, videoFile: null, videoUrl: format === 'video' ? `/api/lessons/${lesson.id}/media?lang=ru` : current.ru.videoUrl },
        kk: { ...current.kk, videoFile: null, videoUrl: format === 'video' ? `/api/lessons/${lesson.id}/media?lang=kk` : current.kk.videoUrl },
      }))
      setNotice(t('Урок сохранён'))
      if (isNew) navigate(`/admin/materials/${lesson.id}`, { replace: true })
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove() {
    if (!window.confirm(t('Удалить урок «{name}»?', { name: title }))) return
    try {
      await api.deleteLesson(id)
      navigate('/admin/materials')
    } catch (err) {
      setError(err.message)
    }
  }

  if (!ready && !error) return <p className="muted">{t('Загрузка…')}</p>

  return (
    <form className="stack" onSubmit={save}>
      <div className="section-head">
        <h1>{isNew ? t('Новый урок') : t('Урок')}</h1>
        <div className="row-actions">
          {!isNew && <Link className="ghost" to={`/admin/materials/${id}/play`}>{t('Открыть')}</Link>}
          {!isNew && <button className="ghost" type="button" onClick={remove}>{t('Удалить')}</button>}
        </div>
      </div>
      <Notice error={error} notice={notice} />
      <label>
        {t('Название, русский')}
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('Солнечная система')} />
      </label>
      <label>
        {t('Название, қазақша')}
        <input value={titleKk} onChange={(event) => setTitleKk(event.target.value)} placeholder="Күн жүйесі" />
      </label>
      <GroupChecks groups={groups} onChange={setGroups} />
      <div className="tone-row">
        <button className={`ghost ${format === 'slides' ? 'on' : ''}`} type="button" onClick={() => setFormat('slides')}>{t('Презентация')}</button>
        <button className={`ghost ${format === 'video' ? 'on' : ''}`} type="button" onClick={() => setFormat('video')}>{t('Видео')}</button>
      </div>
      <div className="tone-row">
        <button className={`ghost ${contentLang === 'ru' ? 'on' : ''}`} type="button" onClick={() => setContentLang('ru')}>{t('Русская версия')}</button>
        <button className={`ghost ${contentLang === 'kk' ? 'on' : ''}`} type="button" onClick={() => setContentLang('kk')}>{t('Казахская версия')}</button>
      </div>
      {format === 'video' ? (
        <section className="stack">
          <div className="section-head">
            <h2>{t('Видео')}</h2>
            <label className="primary file-button">
              {videoName ? t('Заменить ролик') : t('Загрузить ролик')}
              <input className="sr-only" type="file" accept="video/mp4,video/webm,video/quicktime,video/ogg" onChange={pickVideo} />
            </label>
          </div>
          {videoName && <p className="muted">{videoName}</p>}
          {videoUrl && <video className="lesson-video" src={videoUrl} controls playsInline />}
        </section>
      ) : (
      <section className="stack">
        <div className="section-head">
          <h2>{t('Презентация')}</h2>
          <div className="row-actions">
            <button className="ghost" type="button" onClick={() => setSlides((current) => [...current, blankFrame()])}>{t('Текстовый слайд')}</button>
            <label className="primary file-button">
              {t('Загрузить презентацию')}
              <input className="sr-only" type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={upload} />
            </label>
          </div>
        </div>
        {slides.map((slide, index) => (
          <article className="question-card slide-editor" key={slide.id}>
            <header>
              <strong>{t('Слайд {n}', { n: index + 1 })}</strong>
              <div className="row-actions">
                <button className="ghost" type="button" onClick={() => moveSlide(slide.id, -1)}>{t('Выше')}</button>
                <button className="ghost" type="button" onClick={() => moveSlide(slide.id, 1)}>{t('Ниже')}</button>
                <button className="ghost" type="button" onClick={() => setSlides((current) => current.filter((item) => item.id !== slide.id))}>{t('Удалить')}</button>
              </div>
            </header>
            {slide.kind === 'image' ? (
              <>
                {(slide.dataUrl || slide.imageUrl) && <img src={slide.dataUrl || slide.imageUrl} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 16 }} />}
                <label>
                  {t('Подпись')}
                  <input value={slide.caption || ''} onChange={(event) => patchSlide(slide.id, { caption: event.target.value })} />
                </label>
              </>
            ) : (
              <>
                <div className="tone-row">
                  {TONES.map((tone) => (
                    <button
                      key={tone.id}
                      className={`ghost ${slide.tone === tone.id ? 'on' : ''}`}
                      type="button"
                      onClick={() => patchSlide(slide.id, { tone: tone.id })}
                    >
                      {t(tone.label)}
                    </button>
                  ))}
                </div>
                <label>
                  {t('Подпись')}
                  <input value={slide.kicker || ''} onChange={(event) => patchSlide(slide.id, { kicker: event.target.value })} placeholder={t('Слайд 1')} />
                </label>
                <label>
                  {t('Заголовок')}
                  <input value={slide.title} onChange={(event) => patchSlide(slide.id, { title: event.target.value })} />
                </label>
                <label>
                  {t('Текст, каждая строка отдельно')}
                  <textarea
                    value={slide.lines.join('\n')}
                    onChange={(event) => patchSlide(slide.id, { lines: event.target.value.split('\n') })}
                  />
                </label>
                {(slide.dataUrl || slide.imageUrl) && <img src={slide.dataUrl || slide.imageUrl} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 16 }} />}
              </>
            )}
          </article>
        ))}
      </section>
      )}
      <section className="stack">
        <div className="section-head">
          <h2>{t('Тест')}</h2>
          <button className="ghost" type="button" onClick={() => setQuestions((current) => [...current, blankQuestion()])}>{t('Вопрос')}</button>
        </div>
        {questions.map((question, questionIndex) => (
          <article className="question-card" key={question.id}>
            <header>
              <strong>{t('Вопрос {n}', { n: questionIndex + 1 })}</strong>
              <button className="ghost" type="button" onClick={() => setQuestions((current) => current.filter((item) => item.id !== question.id))}>{t('Удалить')}</button>
            </header>
            <label>
              {t('Текст')}
              <textarea
                rows={3}
                value={question.text}
                onChange={(event) => setQuestions((current) => current.map((item) => (
                  item.id === question.id ? { ...item, text: event.target.value } : item
                )))}
              />
            </label>
            <div className="option-edit">
              {question.options.map((option, optionIndex) => (
                <label className="option-line" key={`${question.id}-${optionIndex}`}>
                  <input
                    type="radio"
                    name={`correct-${question.id}`}
                    checked={question.correctIndex === optionIndex}
                    onChange={() => setQuestions((current) => current.map((item) => (
                      item.id === question.id ? { ...item, correctIndex: optionIndex } : item
                    )))}
                  />
                  <input
                    value={option.text}
                    placeholder={t('Вариант {n}', { n: optionIndex + 1 })}
                    onChange={(event) => setQuestions((current) => current.map((item) => {
                      if (item.id !== question.id) return item
                      const options = item.options.map((choice, index) => (
                        index === optionIndex ? { text: event.target.value } : choice
                      ))
                      return { ...item, options }
                    }))}
                  />
                </label>
              ))}
            </div>
          </article>
        ))}
      </section>
      <button className="primary add" type="submit">{t('Сохранить урок')}</button>
    </form>
  )
}
