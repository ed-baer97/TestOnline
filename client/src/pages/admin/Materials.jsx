import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, newId } from '../../api.js'
import { EMPTY_GROUPS, groupLabels } from '../../bands.js'
import { useI18n } from '../../i18n.jsx'
import { GroupChecks, Notice } from './ui.jsx'

const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg']

const TONES = [
  { id: 'sun', label: 'Солнце' },
  { id: 'orbit', label: 'Орбита' },
  { id: 'planets', label: 'Планеты' },
  { id: 'earth', label: 'Земля' },
]

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

export function MaterialList() {
  const { t } = useI18n()
  const [lessons, setLessons] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.lessons().then((data) => setLessons(data.lessons)).catch((err) => setError(err.message))
  }, [])

  return (
    <section className="stack">
      <div className="section-head">
        <h1>{t('Материалы')}</h1>
        <Link className="primary" to="/admin/materials/new">{t('Новый урок')}</Link>
      </div>
      {error && <p className="form-error">{t(error)}</p>}
      {lessons === null && !error && <p className="muted">{t('Загрузка…')}</p>}
      <div className="stack">
        {lessons?.map((lesson) => (
          <article className="lesson-card" key={lesson.id}>
            <div>
              <h2>{lesson.title}</h2>
              <p className="muted">{groupLabels(lesson.groups, t)}</p>
              <p className="muted">{lesson.format === 'video' ? t('Видео · {count} вопр.', { count: lesson.questionCount }) : t('Презентация · {slides} сл. · {count} вопр.', { slides: lesson.slideCount, count: lesson.questionCount })}</p>
            </div>
            <div className="row-actions">
              <Link className="primary" to={`/admin/materials/${lesson.id}/play`}>{t('Открыть')}</Link>
              <Link className="ghost" to={`/admin/materials/${lesson.id}`}>{t('Изменить')}</Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export function LessonEditor() {
  const { t } = useI18n()
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [format, setFormat] = useState('slides')
  const [groups, setGroups] = useState({ ...EMPTY_GROUPS, grades_5_9: true })
  const [slides, setSlides] = useState([blankFrame()])
  const [videoFile, setVideoFile] = useState(null)
  const [videoName, setVideoName] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [questions, setQuestions] = useState([blankQuestion()])
  const savedId = useRef(id || null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [ready, setReady] = useState(isNew)

  useEffect(() => {
    if (isNew) return undefined
    api.lesson(id).then((lesson) => {
      setTitle(lesson.title)
      setFormat(lesson.format === 'video' ? 'video' : 'slides')
      setGroups(lesson.groups)
      setVideoName(lesson.video?.name || '')
      setVideoUrl(lesson.video ? `/api/lessons/${lesson.id}/media` : '')
      const source = lesson.slides.length ? lesson.slides : [blankFrame()]
      setSlides(source.map((slide) => (
        slide.kind === 'frame' ? { ...slide, lines: slide.lines.length ? slide.lines : [''] } : { ...slide, dirty: false }
      )))
      setQuestions(lesson.questions.map((question) => ({
        ...question,
        options: [...question.options, { text: '' }, { text: '' }, { text: '' }, { text: '' }].slice(0, 4),
      })))
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
      setTitle((current) => current.trim() || next.find((slide) => slide.title)?.title || current)
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
    if (format === 'video' && !videoFile && !videoName) {
      setError(t('Загрузите видео'))
      return
    }
    const body = {
      title,
      format,
      groups,
      questions,
    }
    if (format === 'slides') {
      body.slides = slides.map((slide) => {
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
    try {
      const lesson = savedId.current
        ? await api.updateLesson(savedId.current, body)
        : await api.createLesson(body)
      savedId.current = lesson.id
      if (format === 'video' && videoFile) await api.uploadLessonVideo(lesson.id, videoFile)
      setVideoFile(null)
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
        {t('Название')}
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('Солнечная система')} />
      </label>
      <GroupChecks groups={groups} onChange={setGroups} />
      <div className="tone-row">
        <button className={`ghost ${format === 'slides' ? 'on' : ''}`} type="button" onClick={() => setFormat('slides')}>{t('Презентация')}</button>
        <button className={`ghost ${format === 'video' ? 'on' : ''}`} type="button" onClick={() => setFormat('video')}>{t('Видео')}</button>
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
