import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, newId } from '../../api.js'
import { EMPTY_GROUPS, groupLabels } from '../../bands.js'
import { pick, useI18n } from '../../i18n.jsx'
import { Crumbs, SegmentButtons, Segments } from '../../kit.jsx'
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
  const ver = video?.updatedAt ? `&v=${encodeURIComponent(video.updatedAt)}` : ''
  return {
    slides: frames.map((slide) => (
      slide.kind === 'frame' ? { ...slide, lines: slide.lines?.length ? slide.lines : [''], dirty: false } : { ...slide, dirty: false }
    )),
    questions: items.map((question) => ({
      ...question,
      options: [...question.options, { text: '' }, { text: '' }, { text: '' }, { text: '' }].slice(0, 4),
    })),
    videoFile: null,
    videoName: video?.name || '',
    videoUrl: video ? `/api/lessons/${lessonId}/media?lang=${lang}${ver}` : '',
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
  return (
    <Segments
      label="Материалы"
      items={[
        { to: '/admin/materials', label: 'Уроки', end: true },
        { to: '/admin/materials/quizzes', label: 'Квизы' },
      ]}
    />
  )
}

function lessonMeta(lesson, lang, t) {
  const questions = lang === 'kk' && lesson.questionCountKk ? lesson.questionCountKk : lesson.questionCount
  if (lesson.format === 'video') return t('Видео · {count} вопр.', { count: questions })
  const slides = lang === 'kk' && lesson.slideCountKk ? lesson.slideCountKk : lesson.slideCount
  return t('Презентация · {slides} сл. · {count} вопр.', { slides, count: questions })
}

function LessonRow({ lesson, sections, onMove }) {
  const { lang, t } = useI18n()
  const canMove = sections.length > 0 && (sections.length > 1 || !lesson.section)
  return (
    <article className="lesson-card">
      <div>
        <h2>{pick(lang, lesson.title, lesson.titleKk)}</h2>
        <p className="muted">{lessonMeta(lesson, lang, t)}</p>
      </div>
      <div className="row-actions">
        {canMove && (
          <select aria-label={t('Раздел')} value={lesson.section?.id || ''} onChange={(event) => onMove(lesson.id, event.target.value)}>
            {!lesson.section && <option value="">{t('Без раздела')}</option>}
            {sections.map((section) => <option key={section.id} value={section.id}>{pick(lang, section.name, section.nameKk)}</option>)}
          </select>
        )}
        <Link className="primary" to={`/admin/materials/${lesson.id}/play`}>{t('Открыть')}</Link>
        <Link className="ghost" to={`/admin/materials/${lesson.id}`}>{t('Изменить')}</Link>
      </div>
    </article>
  )
}

function SectionBlock({ section, lessons, sections, onChanged, onMove, onError }) {
  const { lang, t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ name: section.name, nameKk: section.nameKk || '', groups: section.groups })
  const rows = lessons.filter((lesson) => lesson.section?.id === section.id)

  async function save(event) {
    event.preventDefault()
    onError('')
    try {
      await api.updateLessonSection(section.id, draft)
      setEditing(false)
      await onChanged()
    } catch (err) {
      onError(err.message)
    }
  }

  async function remove() {
    if (!window.confirm(t('Удалить раздел «{name}»? Уроки останутся без раздела.', { name: pick(lang, section.name, section.nameKk) }))) return
    onError('')
    try {
      await api.deleteLessonSection(section.id)
      await onChanged()
    } catch (err) {
      onError(err.message)
    }
  }

  return (
    <details open>
      <summary>
        {pick(lang, section.name, section.nameKk)}
        <span className="muted"> {rows.length}</span>
      </summary>
      <div className="stack">
        <p className="muted">{groupLabels(section.groups, t) || t('Блоки не отмечены')}</p>
        {editing ? (
          <form className="stack" onSubmit={save}>
            <div className="add-line">
              <input aria-label={t('Название, русский')} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
              <input aria-label={t('Название, қазақша')} value={draft.nameKk} onChange={(event) => setDraft((current) => ({ ...current, nameKk: event.target.value }))} />
            </div>
            <GroupChecks groups={draft.groups} onChange={(groups) => setDraft((current) => ({ ...current, groups }))} />
            <div className="row-actions">
              <button className="primary" type="submit">{t('Сохранить')}</button>
              <button className="ghost" type="button" onClick={() => setEditing(false)}>{t('Закрыть')}</button>
            </div>
          </form>
        ) : (
          <div className="row-actions">
            <button className="ghost" type="button" onClick={() => { setDraft({ name: section.name, nameKk: section.nameKk || '', groups: section.groups }); setEditing(true) }}>{t('Изменить')}</button>
            <button className="ghost danger-btn" type="button" onClick={remove}>{t('Удалить')}</button>
            <Link className="ghost" to={`/admin/materials/new?section=${section.id}`}>+ {t('Урок')}</Link>
          </div>
        )}
        {rows.length === 0 && <p className="muted">{t('Нет уроков')}</p>}
        {rows.map((lesson) => (
          <LessonRow key={lesson.id} lesson={lesson} sections={sections} onMove={onMove} />
        ))}
      </div>
    </details>
  )
}

export function MaterialList() {
  const { t } = useI18n()
  const [lessons, setLessons] = useState(null)
  const [sections, setSections] = useState([])
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [nameKk, setNameKk] = useState('')
  const [groups, setGroups] = useState({ ...EMPTY_GROUPS, grades_5_9: true })

  function load() {
    return Promise.all([api.lessons(), api.lessonSections()]).then(([lessonData, sectionData]) => {
      setLessons(lessonData.lessons)
      setSections(sectionData.sections)
    })
  }

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [])

  async function create(event) {
    event.preventDefault()
    setError('')
    try {
      await api.createLessonSection({ name, nameKk, groups })
      setName('')
      setNameKk('')
      setGroups({ ...EMPTY_GROUPS, grades_5_9: true })
      setAdding(false)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function move(lessonId, sectionId) {
    if (!sectionId) return
    setError('')
    try {
      await api.assignLessonSection(lessonId, sectionId)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const loose = (lessons || []).filter((lesson) => !lesson.section)

  return (
    <section className="stack">
      <div className="section-head">
        <div>
          <h1>{t('Материалы')}</h1>
          <div className="material-tabs">
            <MaterialTabs />
          </div>
        </div>
        <button className="primary" type="button" onClick={() => setAdding(true)}>+ {t('Новый раздел')}</button>
      </div>
      {error && <p className="form-error">{t(error)}</p>}
      {lessons === null && !error && <p className="muted">{t('Загрузка…')}</p>}
      {adding && (
        <form className="stack" onSubmit={create}>
          <div className="add-line">
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('Название раздела')} autoFocus />
            <input value={nameKk} onChange={(event) => setNameKk(event.target.value)} placeholder="Бөлім атауы" />
          </div>
          <div className="stack">
            <p className="muted">{t('Показывать в блоках')}</p>
            <GroupChecks groups={groups} onChange={setGroups} />
          </div>
          <div className="row-actions">
            <button className="primary" type="submit">{t('Создать раздел')}</button>
            <button className="ghost" type="button" onClick={() => setAdding(false)}>{t('Закрыть')}</button>
          </div>
        </form>
      )}
      {lessons && (
        <div className="accordion">
          {sections.map((section) => (
            <SectionBlock key={section.id} section={section} lessons={lessons} sections={sections} onChanged={load} onMove={move} onError={setError} />
          ))}
          {sections.length === 0 && <p className="muted">{t('Нет разделов')}</p>}
          {loose.length > 0 && (
            <div className="stack">
              <h2>{t('Без раздела')}</h2>
              {loose.map((lesson) => (
                <LessonRow key={lesson.id} lesson={lesson} sections={sections} onMove={move} />
              ))}
            </div>
          )}
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
          <div className="material-tabs">
            <MaterialTabs />
          </div>
        </div>
        <Link className="primary" to="/admin/materials/quizzes/new">+ {t('Новый квиз')}</Link>
      </div>
      <QuizCatalog editBase="/admin/materials/quizzes" classLaunch />
    </section>
  )
}

export function LessonEditor() {
  const { lang, t } = useI18n()
  const { id } = useParams()
  const [params] = useSearchParams()
  const isNew = !id
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [titleKk, setTitleKk] = useState('')
  const [format, setFormat] = useState('slides')
  const [sections, setSections] = useState([])
  const [sectionId, setSectionId] = useState(params.get('section') || '')
  const [contentLang, setContentLang] = useState('ru')
  const [packs, setPacks] = useState(() => ({ ru: emptyPack(), kk: emptyPack() }))
  const savedId = useRef(id || null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
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
    api.lessonSections().then((data) => setSections(data.sections)).catch(() => {})
  }, [])

  useEffect(() => {
    if (isNew) return undefined
    api.lesson(id).then((lesson) => {
      setTitle(lesson.title)
      setTitleKk(lesson.titleKk || '')
      setFormat(lesson.format === 'video' ? 'video' : 'slides')
      setSectionId(lesson.section?.id || '')
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
      const data = await api.importPptx(file, contentLang)
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
    if (saving) return
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
    if (!sectionId) {
      setError('Выберите раздел')
      return
    }
    const body = {
      title,
      titleKk,
      format,
      sectionId,
      questions: packs.ru.questions,
      questionsKk: packs.kk.questions,
    }
    if (format === 'slides') {
      body.slides = serializeSlides(packs.ru.slides)
      body.slidesKk = serializeSlides(packs.kk.slides)
    }
    setSaving(true)
    try {
      let lesson = savedId.current
        ? await api.updateLesson(savedId.current, body)
        : await api.createLesson(body)
      savedId.current = lesson.id
      if (format === 'video' && packs.ru.videoFile) lesson = await api.uploadLessonVideo(lesson.id, packs.ru.videoFile, 'ru')
      if (format === 'video' && packs.kk.videoFile) lesson = await api.uploadLessonVideo(lesson.id, packs.kk.videoFile, 'kk')
      if (packs.ru.videoUrl.startsWith('blob:')) URL.revokeObjectURL(packs.ru.videoUrl)
      if (packs.kk.videoUrl.startsWith('blob:')) URL.revokeObjectURL(packs.kk.videoUrl)
      setPacks((current) => {
        const nextRu = packFrom(lesson.slides, lesson.questions, lesson.video, lesson.id, 'ru')
        const nextKk = packFrom(lesson.slidesKk, lesson.questionsKk, lesson.videoKk, lesson.id, 'kk')
        return {
          ru: {
            ...nextRu,
            videoName: nextRu.videoName || current.ru.videoName,
          },
          kk: {
            ...nextKk,
            videoName: nextKk.videoName || current.kk.videoName,
          },
        }
      })
      setNotice(t('Урок сохранён'))
      if (isNew) navigate(`/admin/materials/${lesson.id}`, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
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

  const ruDone = packReady(packs.ru, format) && title.trim().length >= 2
  const kkDone = packReady(packs.kk, format) && titleKk.trim().length >= 2

  return (
    <form className="stack" onSubmit={save}>
      <div className="stats-head">
        <Crumbs items={[
          { to: '/admin/materials', label: t('Материалы') },
          { label: isNew ? t('Новый урок') : (title.trim() || t('Урок')) },
        ]} />
        <div className="section-head">
          <h1>{isNew ? t('Новый урок') : (title.trim() || t('Урок'))}</h1>
          <div className="row-actions">
            <Link className="ghost" to="/admin/materials">{t('К списку')}</Link>
            {!isNew && <Link className="ghost" to={`/admin/materials/${id}/play`}>{t('Открыть')}</Link>}
            {!isNew && <button className="ghost danger-btn" type="button" onClick={remove}>{t('Удалить')}</button>}
            <button className="primary" type="submit" disabled={saving}>
              {saving ? t('Сохранение…') : t('Сохранить урок')}
            </button>
          </div>
        </div>
      </div>
      <Notice error={error} notice={notice} />
      <div className="admin-form">
        <label>
          {t('Название, русский')}
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('Солнечная система')} />
        </label>
        <label>
          {t('Название, қазақша')}
          <input value={titleKk} onChange={(event) => setTitleKk(event.target.value)} placeholder="Күн жүйесі" />
        </label>
        <label>
          {t('Раздел')}
          <select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
            <option value="">{t('Выберите раздел')}</option>
            {sections.map((section) => <option key={section.id} value={section.id}>{pick(lang, section.name, section.nameKk)}</option>)}
          </select>
        </label>
        {sectionId && <p className="muted">{groupLabels(sections.find((section) => section.id === sectionId)?.groups, t)}</p>}
      </div>
      <div className="list-tools">
        <SegmentButtons
          label="Формат"
          value={format}
          onChange={setFormat}
          items={[
            { id: 'slides', label: 'Презентация' },
            { id: 'video', label: 'Видео' },
          ]}
        />
        <SegmentButtons
          label="Язык"
          value={contentLang}
          onChange={setContentLang}
          items={[
            { id: 'ru', label: ruDone ? `${t('Русская версия')} ✓` : t('Русская версия') },
            { id: 'kk', label: kkDone ? `${t('Казахская версия')} ✓` : t('Казахская версия') },
          ]}
        />
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
          {videoUrl && <video className="lesson-video" src={videoUrl} controls playsInline preload="metadata" />}
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
                <button className="ghost" type="button" onClick={() => moveSlide(slide.id, -1)} disabled={index === 0}>{t('Выше')}</button>
                <button className="ghost" type="button" onClick={() => moveSlide(slide.id, 1)} disabled={index === slides.length - 1}>{t('Ниже')}</button>
                <button className="ghost danger-btn" type="button" onClick={() => setSlides((current) => current.filter((item) => item.id !== slide.id))} disabled={slides.length === 1}>{t('Удалить')}</button>
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
              <button className="ghost danger-btn" type="button" onClick={() => setQuestions((current) => current.filter((item) => item.id !== question.id))} disabled={questions.length === 1}>{t('Удалить')}</button>
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
                    name={`correct-${contentLang}-${question.id}`}
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
                      const options = item.options.map((opt, idx) => (idx === optionIndex ? { text: event.target.value } : opt))
                      return { ...item, options }
                    }))}
                  />
                </label>
              ))}
            </div>
          </article>
        ))}
      </section>
      <button className="primary add" type="submit" disabled={saving}>
        {saving ? t('Сохранение…') : t('Сохранить урок')}
      </button>
    </form>
  )
}
