import { Link, useNavigate, useParams } from 'react-router-dom'
import { groupLabels } from '../../lib/bands.js'
import { blankFrame, blankQuestion, useLessonEditor, useMaterialList } from '../../state/admin/materials.js'
import { GroupChecks, Notice } from '../../components/admin/ui.jsx'

const TONES = [
  { id: 'sun', label: 'Солнце' },
  { id: 'orbit', label: 'Орбита' },
  { id: 'planets', label: 'Планеты' },
  { id: 'earth', label: 'Земля' },
]

export function MaterialList() {
  const { lessons, error } = useMaterialList()

  return (
    <section className="stack">
      <div className="section-head">
        <h1>Материалы</h1>
        <Link className="primary" to="/admin/materials/new">Новый урок</Link>
      </div>
      {error && <p className="form-error">{error}</p>}
      {lessons === null && !error && <p className="muted">Загрузка…</p>}
      <div className="stack">
        {lessons?.map((lesson) => (
          <article className="lesson-card" key={lesson.id}>
            <div>
              <h2>{lesson.title}</h2>
              <p className="muted">{groupLabels(lesson.groups)}</p>
              <p className="muted">{lesson.format === 'video' ? `Видео · ${lesson.questionCount} вопр.` : `Презентация · ${lesson.slideCount} сл. · ${lesson.questionCount} вопр.`}</p>
            </div>
            <div className="row-actions">
              <Link className="primary" to={`/admin/materials/${lesson.id}/play`}>Открыть</Link>
              <Link className="ghost" to={`/admin/materials/${lesson.id}`}>Изменить</Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export function LessonEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const {
    isNew, title, setTitle, format, setFormat, groups, setGroups, slides, setSlides, videoName, videoUrl,
    questions, setQuestions, error, notice, ready, patchSlide, moveSlide, upload, pickVideo, save, remove,
  } = useLessonEditor(id, navigate)

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
      <GroupChecks groups={groups} onChange={setGroups} />
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
