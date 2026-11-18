import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { EMPTY_GROUPS, groupLabels } from '../../lib/bands.js'
import { blankFrame, blankQuestion, useLessonEditor, useMaterialList } from '../../state/admin/materials.js'
import { GroupChecks, Notice } from '../../components/admin/ui.jsx'

const TONES = [
  { id: 'sun', label: 'Солнце' },
  { id: 'orbit', label: 'Орбита' },
  { id: 'planets', label: 'Планеты' },
  { id: 'earth', label: 'Земля' },
]

function LessonRow({ lesson, sections, onMove }) {
  return (
    <article className="lesson-card">
      <div>
        <h2>{lesson.title}</h2>
        <p className="muted">{lesson.format === 'video' ? `Видео · ${lesson.questionCount} вопр.` : `Презентация · ${lesson.slideCount} сл. · ${lesson.questionCount} вопр.`}</p>
      </div>
      <div className="row-actions">
        <select value={lesson.section?.id || ''} onChange={(event) => event.target.value && onMove(lesson.id, event.target.value)}>
          {!lesson.section && <option value="">В раздел…</option>}
          {sections.map((section) => (
            <option key={section.id} value={section.id}>{section.name}</option>
          ))}
        </select>
        <Link className="primary" to={`/admin/materials/${lesson.id}/play`}>Открыть</Link>
        <Link className="ghost" to={`/admin/materials/${lesson.id}`}>Изменить</Link>
      </div>
    </article>
  )
}

export function MaterialList() {
  const { lessons, sections, error, createSection, saveSection, removeSection, moveLesson } = useMaterialList()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [groups, setGroups] = useState({ ...EMPTY_GROUPS, grades_5_9: true })
  const [formError, setFormError] = useState('')
  const [drafts, setDrafts] = useState({})

  function draftOf(section) {
    return drafts[section.id] || { name: section.name, groups: section.groups }
  }

  function patchDraft(section, patch) {
    setDrafts((current) => ({ ...current, [section.id]: { ...draftOf(section), ...patch } }))
  }

  async function submitSection(event) {
    event.preventDefault()
    setFormError('')
    try {
      await createSection({ name, groups })
      setName('')
      setGroups({ ...EMPTY_GROUPS, grades_5_9: true })
      setCreating(false)
    } catch (err) {
      setFormError(err.message)
    }
  }

  async function keepSection(section) {
    setFormError('')
    try {
      await saveSection(section.id, draftOf(section))
      setDrafts((current) => {
        const next = { ...current }
        delete next[section.id]
        return next
      })
    } catch (err) {
      setFormError(err.message)
    }
  }

  function dropSection(section) {
    if (!window.confirm(`Удалить раздел «${section.name}»? Уроки останутся без раздела.`)) return
    setFormError('')
    removeSection(section.id).catch((err) => setFormError(err.message))
  }

  const loose = lessons?.filter((lesson) => !lesson.section) || []

  return (
    <section className="stack">
      <div className="section-head">
        <h1>Материалы</h1>
        <button className="primary" type="button" onClick={() => setCreating((value) => !value)}>Новый раздел</button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {formError && <p className="form-error">{formError}</p>}
      {creating && (
        <form className="stack" onSubmit={submitSection}>
          <label>
            Название раздела
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Солнечная система" />
          </label>
          <p className="muted">Показывать в блоках</p>
          <GroupChecks groups={groups} onChange={setGroups} />
          <button className="primary" type="submit">Создать раздел</button>
        </form>
      )}
      {lessons === null && !error && <p className="muted">Загрузка…</p>}
      <div className="stack">
        {sections.map((section) => {
          const draft = draftOf(section)
          const inside = lessons?.filter((lesson) => lesson.section?.id === section.id) || []
          return (
            <section className="stack" key={section.id}>
              <div className="section-head">
                <h2>{section.name}</h2>
                <Link className="primary" to={`/admin/materials/new?section=${section.id}`}>+ Урок</Link>
              </div>
              <label>
                Название
                <input value={draft.name} onChange={(event) => patchDraft(section, { name: event.target.value })} />
              </label>
              <GroupChecks groups={draft.groups} onChange={(next) => patchDraft(section, { groups: next })} />
              <p className="muted">{groupLabels(draft.groups) || 'Блоки не выбраны'}</p>
              <div className="row-actions">
                <button className="primary" type="button" onClick={() => keepSection(section)}>Сохранить раздел</button>
                <button className="ghost" type="button" onClick={() => dropSection(section)}>Удалить раздел</button>
              </div>
              {inside.map((lesson) => <LessonRow lesson={lesson} sections={sections} onMove={moveLesson} key={lesson.id} />)}
            </section>
          )
        })}
        {loose.length > 0 && (
          <section className="stack">
            <h2>Без раздела</h2>
            {loose.map((lesson) => <LessonRow lesson={lesson} sections={sections} onMove={moveLesson} key={lesson.id} />)}
          </section>
        )}
      </div>
    </section>
  )
}

export function LessonEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const {
    isNew, title, setTitle, format, setFormat, sections, sectionId, setSectionId, slides, setSlides, videoName, videoUrl,
    questions, setQuestions, error, notice, ready, patchSlide, moveSlide, upload, pickVideo, save, remove,
  } = useLessonEditor(id, navigate, params.get('section') || '')

  function confirmRemove() {
    if (window.confirm(`Удалить урок «${title}»?`)) remove()
  }

  if (!ready && !error) return <p className="muted">Загрузка…</p>

  return (
    <form className="stack" onSubmit={save}>
      <div className="section-head">
        <h1>{isNew ? 'Новый урок' : 'Урок'}</h1>
        <div className="row-actions">
          {!isNew && <Link className="ghost" to={`/admin/materials/${id}/play`}>Открыть</Link>}
          {!isNew && <button className="ghost" type="button" onClick={confirmRemove}>Удалить</button>}
        </div>
      </div>
      <Notice error={error} notice={notice} />
      <label>
        Название
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Солнечная система" />
      </label>
      <label>
        Раздел
        <select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
          <option value="">Выберите раздел</option>
          {sections.map((section) => (
            <option key={section.id} value={section.id}>{section.name}</option>
          ))}
        </select>
      </label>
      {sectionId && <p className="muted">{groupLabels(sections.find((section) => section.id === sectionId)?.groups)}</p>}
      <div className="tone-row">
        <button className={`ghost ${format === 'slides' ? 'on' : ''}`} type="button" onClick={() => setFormat('slides')}>Презентация</button>
        <button className={`ghost ${format === 'video' ? 'on' : ''}`} type="button" onClick={() => setFormat('video')}>Видео</button>
      </div>
      {format === 'video' ? (
        <section className="stack">
          <div className="section-head">
            <h2>Видео</h2>
            <label className="primary file-button">
              {videoName ? 'Заменить ролик' : 'Загрузить ролик'}
              <input className="sr-only" type="file" accept="video/mp4,video/webm,video/quicktime,video/ogg" onChange={pickVideo} />
            </label>
          </div>
          {videoName && <p className="muted">{videoName}</p>}
          {videoUrl && <video className="lesson-video" src={videoUrl} controls playsInline />}
        </section>
      ) : (
      <section className="stack">
        <div className="section-head">
          <h2>Презентация</h2>
          <div className="row-actions">
            <button className="ghost" type="button" onClick={() => setSlides((current) => [...current, blankFrame()])}>Текстовый слайд</button>
            <label className="primary file-button">
              Загрузить презентацию
              <input className="sr-only" type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={upload} />
            </label>
          </div>
        </div>
        {slides.map((slide, index) => (
          <article className="question-card slide-editor" key={slide.id}>
            <header>
              <strong>Слайд {index + 1}</strong>
              <div className="row-actions">
                <button className="ghost" type="button" onClick={() => moveSlide(slide.id, -1)}>Выше</button>
                <button className="ghost" type="button" onClick={() => moveSlide(slide.id, 1)}>Ниже</button>
                <button className="ghost" type="button" onClick={() => setSlides((current) => current.filter((item) => item.id !== slide.id))}>Удалить</button>
              </div>
            </header>
            {slide.kind === 'image' ? (
              <>
                {(slide.dataUrl || slide.imageUrl) && <img src={slide.dataUrl || slide.imageUrl} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 16 }} />}
                <label>
                  Подпись
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
                      {tone.label}
                    </button>
                  ))}
                </div>
                <label>
                  Подпись
                  <input value={slide.kicker || ''} onChange={(event) => patchSlide(slide.id, { kicker: event.target.value })} placeholder="Слайд 1" />
                </label>
                <label>
                  Заголовок
                  <input value={slide.title} onChange={(event) => patchSlide(slide.id, { title: event.target.value })} />
                </label>
                <label>
                  Текст, каждая строка отдельно
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
          <h2>Тест</h2>
          <button className="ghost" type="button" onClick={() => setQuestions((current) => [...current, blankQuestion()])}>Вопрос</button>
        </div>
        {questions.map((question, questionIndex) => (
          <article className="question-card" key={question.id}>
            <header>
              <strong>Вопрос {questionIndex + 1}</strong>
              <button className="ghost" type="button" onClick={() => setQuestions((current) => current.filter((item) => item.id !== question.id))}>Удалить</button>
            </header>
            <label>
              Текст
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
                    placeholder={`Вариант ${optionIndex + 1}`}
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
      <button className="primary add" type="submit">Сохранить урок</button>
    </form>
  )
}
