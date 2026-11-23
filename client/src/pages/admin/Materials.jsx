import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { GroupChecks, Notice } from '../../components/admin/ui.jsx'
import { BANDS, EMPTY_GROUPS, groupLabels } from '../../lib/bands.js'
import { groupLessons } from '../../lib/lessons.js'
import { blankFrame, blankQuestion, useLessonEditor, useMaterialCatalog, useMaterialList } from '../../state/admin/materials.js'
import { useQuizList } from '../../state/host/quizzes.js'
import { pick, useI18n } from '../../state/i18n.jsx'
import Editor from '../host/Editor.jsx'

const TONES = [
  { id: 'sun', label: 'Солнце' },
  { id: 'orbit', label: 'Орбита' },
  { id: 'planets', label: 'Планеты' },
  { id: 'earth', label: 'Земля' },
]

function lessonSubtitle(lesson, lang, t) {
  const countLang = lesson.languages?.[lang] ? lang : (lesson.languages?.ru ? 'ru' : 'kk')
  const slides = countLang === 'kk' ? (lesson.slideCountKk ?? lesson.slideCount) : lesson.slideCount
  const questions = countLang === 'kk' ? (lesson.questionCountKk ?? lesson.questionCount) : lesson.questionCount
  const badges = [lesson.languages?.ru && 'Рус', lesson.languages?.kk && 'Қаз'].filter(Boolean).join(' · ')
  const summary = lesson.format === 'video'
    ? t('Видео · {count} вопр.', { count: questions })
    : t('Презентация · {slides} сл. · {count} вопр.', { slides, count: questions })
  return badges ? `${summary} · ${badges}` : summary
}

function LessonRow({ lesson, index, total, prevId, nextId, sections, onMove, onReorder }) {
  const { lang, t } = useI18n()
  return (
    <article className="lesson-card">
      <div>
        <h2>{index + 1}. {pick(lang, lesson.title, lesson.titleKk)}</h2>
        <p className="muted">{lessonSubtitle(lesson, lang, t)}</p>
      </div>
      <div className="row-actions">
        <button className="ghost" type="button" disabled={index === 0} onClick={() => onReorder(lesson.id, -1, prevId)}>{t('Выше')}</button>
        <button className="ghost" type="button" disabled={index === total - 1} onClick={() => onReorder(lesson.id, 1, nextId)}>{t('Ниже')}</button>
        <select value={lesson.section?.id || ''} onChange={(event) => event.target.value && onMove(lesson.id, event.target.value)}>
          {!lesson.section && <option value="">{t('В раздел…')}</option>}
          {sections.map((section) => (
            <option key={section.id} value={section.id}>{section.name}</option>
          ))}
        </select>
        <Link className="primary" to={`/admin/materials/${lesson.id}/play`}>{t('Открыть')}</Link>
        <Link className="ghost" to={`/admin/materials/${lesson.id}`}>{t('Изменить')}</Link>
      </div>
    </article>
  )
}

function SectionLessons({ items, sections, onMove, onReorder }) {
  return items.map((lesson, index) => (
    <LessonRow
      key={lesson.id}
      lesson={lesson}
      index={index}
      total={items.length}
      prevId={items[index - 1]?.id}
      nextId={items[index + 1]?.id}
      sections={sections}
      onMove={onMove}
      onReorder={onReorder}
    />
  ))
}

function blockGroupLabels(items, t) {
  const combined = Object.fromEntries(BANDS.map((band) => [band.id, items.some((lesson) => lesson.groups?.[band.id])]))
  return groupLabels(combined, t)
}

function CatalogCard({ lesson, index }) {
  const { lang, t } = useI18n()
  const subtitle = lessonSubtitle(lesson, lang, t)
  const groupsText = groupLabels(lesson.groups, t)
  return (
    <Link className="lesson-card" to={`/admin/materials/${lesson.id}/play`}>
      <div>
        <h2>{index + 1}. {pick(lang, lesson.title, lesson.titleKk)}</h2>
        <p className="muted">
          {subtitle}
          {groupsText ? ` · ${groupsText}` : ''}
        </p>
      </div>
      <span className="primary">{t('Открыть')}</span>
    </Link>
  )
}

export function MaterialCatalog() {
  const { lang, t } = useI18n()
  const { lessons, error } = useMaterialCatalog()
  const visible = lessons?.filter((lesson) => lesson.languages?.[lang]) || []
  const hiddenByLang = Boolean(lessons?.length && visible.length === 0)
  const blocks = groupLessons(visible, lang)

  return (
    <section className="stack">
      <div className="section-head">
        <h1>{t('Материалы')}</h1>
      </div>
      {error && <p className="form-error">{t(error)}</p>}
      {lessons === null && !error && <p className="muted">{t('Загрузка…')}</p>}
      {lessons && visible.length === 0 && (
        <p className="muted">{t(hiddenByLang ? 'В этом языке пока нет уроков.' : 'Нет уроков')}</p>
      )}
      {blocks.length === 1 && !blocks[0].title ? (
        blocks[0].lessons.map((lesson, index) => (
          <CatalogCard key={lesson.id} lesson={lesson} index={index} />
        ))
      ) : blocks.length > 0 && (
        <div className="accordion">
          {blocks.map((block) => {
            const groupsText = blockGroupLabels(block.lessons, t)
            return (
              <details key={block.key || 'loose'} open={blocks.length === 1 || undefined}>
                <summary>
                  <span className="summary-line">
                    <span>{block.title || t('Без раздела')}</span>
                    <span className="muted">
                      {t('Уроков: {count}', { count: block.lessons.length })}
                      {groupsText ? ` · ${groupsText}` : ''}
                    </span>
                  </span>
                </summary>
                <div className="stack">
                  {block.lessons.map((lesson, index) => (
                    <CatalogCard key={lesson.id} lesson={lesson} index={index} />
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

export function MaterialList() {
  const { lang, t } = useI18n()
  const { lessons, sections, error, createSection, saveSection, removeSection, moveLesson, reorderLesson } = useMaterialList()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [groups, setGroups] = useState({ ...EMPTY_GROUPS, grades_5_9: true })
  const [formError, setFormError] = useState('')
  const [drafts, setDrafts] = useState({})

  function draftOf(section) {
    return drafts[section.id] || { name: section.name, groups: section.groups }
  }

  function patchDraft(section, patch) {
    setDrafts((current) => {
      const base = current[section.id] || { name: section.name, groups: section.groups }
      return { ...current, [section.id]: { ...base, ...patch } }
    })
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
    if (!window.confirm(t('Удалить раздел «{name}»? Уроки останутся без раздела.', { name: section.name }))) return
    setFormError('')
    removeSection(section.id).catch((err) => setFormError(err.message))
  }

  const visible = lessons?.filter((lesson) => lesson.languages?.[lang])
  const hiddenByLang = Boolean(lessons?.length && visible?.length === 0)
  const loose = visible?.filter((lesson) => !lesson.section) || []

  return (
    <section className="stack">
      <div className="section-head">
        <h1>{t('Материалы')}</h1>
        <button className="primary" type="button" onClick={() => setCreating((value) => !value)}>{t('Новый раздел')}</button>
      </div>
      {error && <p className="form-error">{t(error)}</p>}
      {formError && <p className="form-error">{t(formError)}</p>}
      {creating && (
        <form className="stack" onSubmit={submitSection}>
          <label>
            {t('Название раздела')}
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('Солнечная система')} />
          </label>
          <p className="muted">{t('Показывать в блоках')}</p>
          <GroupChecks groups={groups} onChange={setGroups} />
          <button className="primary" type="submit">{t('Создать раздел')}</button>
        </form>
      )}
      {lessons === null && !error && <p className="muted">{t('Загрузка…')}</p>}
      {hiddenByLang && <p className="muted">{t('В этом языке пока нет уроков.')}</p>}
      {(sections.length > 0 || loose.length > 0) && (
        <div className="accordion">
          {sections.map((section) => {
            const draft = draftOf(section)
            const inside = visible?.filter((lesson) => lesson.section?.id === section.id) || []
            const groupsText = groupLabels(section.groups, t)
            return (
              <details key={section.id}>
                <summary>
                  <span className="summary-line">
                    <span>{section.name}</span>
                    <span className="muted">
                      {t('Уроков: {count}', { count: inside.length })}
                      {groupsText ? ` · ${groupsText}` : ''}
                    </span>
                  </span>
                </summary>
                <div className="stack">
                  <div className="form-card-head">
                    <span className="muted">{groupLabels(draft.groups, t) || t('Блоки не выбраны')}</span>
                    <Link className="primary" to={`/admin/materials/new?section=${section.id}`}>{t('+ Урок')}</Link>
                  </div>
                  <label>
                    {t('Название')}
                    <input value={draft.name} onChange={(event) => patchDraft(section, { name: event.target.value })} />
                  </label>
                  <GroupChecks groups={draft.groups} onChange={(next) => patchDraft(section, { groups: next })} />
                  <div className="row-actions">
                    <button className="primary" type="button" onClick={() => keepSection(section)}>{t('Сохранить раздел')}</button>
                    <button className="ghost" type="button" onClick={() => dropSection(section)}>{t('Удалить раздел')}</button>
                  </div>
                  <SectionLessons items={inside} sections={sections} onMove={moveLesson} onReorder={reorderLesson} />
                </div>
              </details>
            )
          })}
          {loose.length > 0 && (
            <details>
              <summary>
                <span className="summary-line">
                  <span>{t('Без раздела')}</span>
                  <span className="muted">{t('Уроков: {count}', { count: loose.length })}</span>
                </span>
              </summary>
              <div className="stack">
                <SectionLessons items={loose} sections={sections} onMove={moveLesson} onReorder={reorderLesson} />
              </div>
            </details>
          )}
        </div>
      )}
    </section>
  )
}

export function LessonEditor() {
  const { lang, t } = useI18n()
  const { id } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const {
    isNew, title, setTitle, titleKk, setTitleKk, contentLang, setContentLang, format, setFormat, sections, sectionId, setSectionId,
    slides, setSlides, videoName, videoUrl, saving, uploadProgress, uploadingLang, statuses, hasContent,
    questions, setQuestions, error, notice, ready, patchSlide, moveSlide, upload, pickVideo, removeVideo, clearVersion, save, remove,
  } = useLessonEditor(id, navigate, params.get('section') || '')

  function confirmRemove() {
    if (window.confirm(t('Удалить урок «{name}»?', { name: pick(lang, title, titleKk) }))) remove()
  }

  if (!ready && !error) return <p className="muted">{t('Загрузка…')}</p>

  return (
    <form className="stack" onSubmit={save}>
      <div className="section-head">
        <h1>{t(isNew ? 'Новый урок' : 'Урок')}</h1>
        <div className="row-actions">
          {!isNew && <Link className="ghost" to={`/admin/materials/${id}/play`}>{t('Открыть')}</Link>}
          {!isNew && <button className="ghost" type="button" onClick={confirmRemove}>{t('Удалить')}</button>}
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
      <label>
        {t('Раздел')}
        <select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
          <option value="">{t('Выберите раздел')}</option>
          {sections.map((section) => (
            <option key={section.id} value={section.id}>{section.name}</option>
          ))}
        </select>
      </label>
      {sectionId && <p className="muted">{groupLabels(sections.find((section) => section.id === sectionId)?.groups, t)}</p>}
      <div className="tone-row">
        <button className={`ghost ${format === 'slides' ? 'on' : ''}`} type="button" onClick={() => setFormat('slides')}>{t('Презентация')}</button>
        <button className={`ghost ${format === 'video' ? 'on' : ''}`} type="button" onClick={() => setFormat('video')}>{t('Видео')}</button>
      </div>
      <div className="tone-row" role="group" aria-label={t('Язык версии')}>
        {[
          { code: 'ru', label: 'Русская версия' },
          { code: 'kk', label: 'Казахская версия' },
        ].map((item) => {
          const status = statuses[item.code]
          const stateText = status === 'ready' ? t('Загружено') : status === 'partial' ? t('Не завершено') : t('Не загружено')
          return (
            <button
              key={item.code}
              className={`ghost ${contentLang === item.code ? 'on' : ''}`}
              type="button"
              onClick={() => setContentLang(item.code)}
            >
              {t(item.label)} ({stateText})
            </button>
          )
        })}
        {hasContent && (
          <button className="ghost" type="button" onClick={clearVersion}>{t('Очистить версию')}</button>
        )}
      </div>
      {format === 'video' ? (
        <section className="stack">
          <div className="section-head">
            <h2>{t('Видео')}</h2>
            <div className="row-actions">
              {videoName && (
                <button className="ghost" type="button" onClick={removeVideo}>{t('Удалить ролик')}</button>
              )}
              <label className="primary file-button">
                {t(videoName ? 'Заменить ролик' : 'Загрузить ролик')}
                <input className="sr-only" type="file" accept="video/mp4,video/webm,video/quicktime,video/ogg" onChange={pickVideo} />
              </label>
            </div>
          </div>
          {videoName && <p className="muted">{videoName}</p>}
          {uploadProgress != null && (
            <div className="upload-progress">
              <p className="muted">
                {t('Загрузка видео {percent}%', { percent: uploadProgress })}
                {uploadingLang ? ` · ${t(uploadingLang === 'kk' ? 'Казахская версия' : 'Русская версия')}` : ''}
              </p>
              <div className="upload-track" role="progressbar" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100} aria-label={t('Загрузка видео')}>
                <div style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}
          {videoUrl && <video key={`${contentLang}-${videoUrl}`} className="lesson-video" src={videoUrl} controls playsInline />}
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
      <button className="primary add" type="submit" disabled={saving}>{t(saving ? 'Сохранение…' : 'Сохранить урок')}</button>
    </form>
  )
}

export function MaterialQuizzes() {
  const { lang, t } = useI18n()
  const navigate = useNavigate()
  const { quizzes, hiddenByLang, orgs, error, start, remove } = useQuizList(navigate, { classLaunch: true })
  const [launchId, setLaunchId] = useState('')
  const [mode, setMode] = useState('public')
  const [orgId, setOrgId] = useState('')
  const [classId, setClassId] = useState('')

  const effectiveOrgId = orgs?.length === 1 ? orgs[0].id : orgId
  const classes = orgs?.find((org) => org.id === effectiveOrgId)?.classes || []

  function openLaunch(id) {
    setLaunchId((current) => (current === id ? '' : id))
    setMode('public')
    setOrgId(orgs?.length === 1 ? orgs[0].id : '')
    setClassId('')
  }

  function confirmRemove(quiz) {
    if (window.confirm(t('Удалить «{name}»?', { name: quiz.title }))) remove(quiz)
  }

  return (
    <section className="stack">
      <div className="section-head">
        <h1>{t('Квизы')}</h1>
        <Link className="primary" to="/admin/quizzes/new">{t('Новый квиз')}</Link>
      </div>
      {error && <p className="form-error">{t(error)}</p>}
      {quizzes === null && !error && <p className="muted">{t('Загрузка…')}</p>}
      {quizzes?.length === 0 && (
        <p className="muted">{t(hiddenByLang ? 'В этом языке пока нет квизов.' : 'Пока нет квизов. Создайте первый.')}</p>
      )}
      <div className="quiz-list">
        {quizzes?.map((quiz) => (
          <article className="card quiz-card" key={quiz.id}>
            <div>
              <h2>{quiz.title}</h2>
              <p className="muted">{t('{count} вопр.', { count: quiz.questionCount })} · {quiz.lang === 'kk' ? 'Қаз' : 'Рус'}</p>
            </div>
            <div className="top-actions">
              <button className="primary" type="button" onClick={() => openLaunch(quiz.id)}>{t('Запустить')}</button>
              <Link to={`/admin/quizzes/${quiz.id}/stats`}>{t('Статистика')}</Link>
              <Link to={`/admin/quizzes/${quiz.id}`}>{t('Править')}</Link>
              <button className="ghost" type="button" onClick={() => confirmRemove(quiz)}>{t('Удалить')}</button>
            </div>
            {launchId === quiz.id && (
              <form
                className="launch-box"
                onSubmit={(event) => {
                  event.preventDefault()
                  start(
                    quiz.id,
                    mode === 'private'
                      ? { mode: 'private', organizationId: effectiveOrgId, classId }
                      : { mode: 'public' },
                  )
                }}
              >
                <div className="tone-row">
                  <button className={`ghost ${mode === 'public' ? 'on' : ''}`} type="button" onClick={() => setMode('public')}>{t('Публичный')}</button>
                  <button className={`ghost ${mode === 'private' ? 'on' : ''}`} type="button" onClick={() => setMode('private')}>{t('Приватный')}</button>
                </div>
                {mode === 'private' && (
                  <>
                    <label>
                      {t('Организация')}
                      <select
                        value={effectiveOrgId}
                        onChange={(event) => { setOrgId(event.target.value); setClassId('') }}
                        disabled={!orgs?.length}
                      >
                        <option value="">{t(orgs?.length ? 'Выберите организацию' : 'Нет организаций')}</option>
                        {(orgs || []).map((org) => (
                          <option key={org.id} value={org.id}>{pick(lang, org.name, org.nameKk)}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t('Класс')}
                      <select value={classId} onChange={(event) => setClassId(event.target.value)} disabled={!effectiveOrgId}>
                        <option value="">{t('Выберите класс')}</option>
                        {classes.map((item) => (
                          <option key={item.id} value={item.id}>{t(item.label)}</option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <button className="primary" type="submit" disabled={mode === 'private' && !classId}>{t('Запустить')}</button>
              </form>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

export function MaterialQuizEditor() {
  return (
    <section className="stack">
      <Editor embedded />
    </section>
  )
}
