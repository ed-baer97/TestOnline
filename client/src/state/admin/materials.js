import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/index.js'
import { newId } from '../../lib/ids.js'
import { dropStatsCache } from './platformStats.js'

const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg']

export function blankFrame() {
  return { id: newId(), kind: 'frame', tone: 'orbit', kicker: '', title: '', lines: [''] }
}

export function blankQuestion() {
  return {
    id: newId(),
    text: '',
    correctIndex: 0,
    options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
  }
}

function emptyPack() {
  return {
    slides: [blankFrame()],
    questions: [blankQuestion()],
    videoFile: null,
    videoName: '',
    videoUrl: '',
    hasSavedVideo: false,
    removeVideo: false,
  }
}

function normalizeLoadedSlides(list) {
  const source = Array.isArray(list) && list.length ? list : [blankFrame()]
  return source.map((slide) => (
    slide.kind === 'frame'
      ? { ...slide, lines: slide.lines?.length ? slide.lines : [''], dirty: false }
      : { ...slide, dirty: false }
  ))
}

function normalizeLoadedQuestions(list) {
  const source = Array.isArray(list) && list.length ? list : [blankQuestion()]
  return source.map((question) => ({
    ...question,
    options: [...(question.options || []), { text: '' }, { text: '' }, { text: '' }, { text: '' }].slice(0, 4),
  }))
}

function packFromServer(lessonId, code, pack, stamp = '') {
  const hasVideo = Boolean(pack?.video)
  return {
    slides: normalizeLoadedSlides(pack?.slides),
    questions: normalizeLoadedQuestions(pack?.questions),
    videoFile: null,
    videoName: pack?.video?.name || '',
    videoUrl: hasVideo ? `/api/lessons/${lessonId}/media?lang=${code}${stamp ? `&v=${stamp}` : ''}` : '',
    hasSavedVideo: hasVideo,
    removeVideo: false,
  }
}

function isBlankSlides(list) {
  if (!Array.isArray(list) || list.length === 0) return true
  return list.every((slide) => {
    if (slide?.kind === 'image') return !slide.fileId && !slide.dataUrl && !String(slide.caption || '').trim()
    return !String(slide?.title || '').trim()
      && !(Array.isArray(slide?.lines) && slide.lines.some((line) => String(line || '').trim()))
      && !slide?.dataUrl
      && !slide?.imageFileId
  })
}

function isBlankQuestions(list) {
  if (!Array.isArray(list) || list.length === 0) return true
  return list.every((question) => {
    if (String(question?.text || '').trim()) return false
    const options = Array.isArray(question?.options) ? question.options : []
    return options.every((option) => !String(option?.text || '').trim())
  })
}

function packStatus(format, pack) {
  const hasQ = !isBlankQuestions(pack.questions)
  const hasMedia = format === 'video'
    ? Boolean(pack.videoFile || (pack.hasSavedVideo && !pack.removeVideo))
    : !isBlankSlides(pack.slides)
  if (!hasMedia && !hasQ) return 'empty'
  if (hasMedia && hasQ) return 'ready'
  return 'partial'
}

function serializeSlides(list) {
  return list.map((slide) => {
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

export function useMaterialList() {
  const [lessons, setLessons] = useState(null)
  const [sections, setSections] = useState([])
  const [error, setError] = useState('')

  function load() {
    return Promise.all([api.lessons(), api.lessonSections()])
      .then(([data, sectionsData]) => {
        setLessons(data.lessons)
        setSections(sectionsData.sections)
      })
      .catch((err) => setError(err.message))
  }

  useEffect(() => {
    load()
  }, [])

  async function createSection(body) {
    await api.createLessonSection(body)
    dropStatsCache()
    await load()
  }

  async function saveSection(id, body) {
    await api.updateLessonSection(id, body)
    dropStatsCache()
    await load()
  }

  async function removeSection(id) {
    await api.deleteLessonSection(id)
    dropStatsCache()
    await load()
  }

  async function moveLesson(lessonId, sectionId) {
    try {
      await api.assignLessonSection(lessonId, sectionId)
      dropStatsCache()
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return { lessons, sections, error, createSection, saveSection, removeSection, moveLesson }
}

// Редактор урока. После первого сохранения урок обновляется по savedId, а новый адрес подменяет /new.
export function useLessonEditor(id, navigate, initialSectionId = '') {
  const isNew = !id
  const [title, setTitle] = useState('')
  const [titleKk, setTitleKk] = useState('')
  const [contentLang, setContentLang] = useState('ru')
  const [format, setFormat] = useState('slides')
  const [sections, setSections] = useState([])
  const [sectionId, setSectionId] = useState(initialSectionId)
  const [packs, setPacks] = useState(() => ({ ru: emptyPack(), kk: emptyPack() }))
  const savedId = useRef(id || null)
  const blobsRef = useRef({ ru: '', kk: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [ready, setReady] = useState(isNew)
  const [saving, setSaving] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [uploadingLang, setUploadingLang] = useState('')

  function revokeBlob(code) {
    const url = blobsRef.current[code]
    if (url && url.startsWith('blob:')) URL.revokeObjectURL(url)
    blobsRef.current[code] = ''
  }

  function revokeBlobs() {
    revokeBlob('ru')
    revokeBlob('kk')
  }

  function updatePack(code, updater) {
    setPacks((current) => ({
      ...current,
      [code]: typeof updater === 'function' ? updater(current[code]) : updater,
    }))
  }

  useEffect(() => {
    savedId.current = id || null
    let alive = true
    setError('')
    setNotice('')
    revokeBlobs()
    api.lessonSections().then((data) => { if (alive) setSections(data.sections) }).catch((err) => { if (alive) setError(err.message) })
    if (isNew) {
      setTitle('')
      setTitleKk('')
      setContentLang('ru')
      setFormat('slides')
      setSectionId(initialSectionId)
      setPacks({ ru: emptyPack(), kk: emptyPack() })
      setReady(true)
      return () => { alive = false }
    }
    setReady(false)
    api.lesson(id).then((lesson) => {
      if (!alive) return
      const ruPack = lesson.packs?.ru || {
        title: lesson.title,
        slides: lesson.slides,
        video: lesson.video,
        questions: lesson.questions,
      }
      const kkPack = lesson.packs?.kk || {
        title: lesson.titleKk,
        slides: [],
        video: null,
        questions: [],
      }
      setTitle(ruPack.title ?? '')
      setTitleKk(kkPack.title ?? '')
      setFormat(lesson.format === 'video' ? 'video' : 'slides')
      if (lesson.section?.id) setSectionId(lesson.section.id)
      setPacks({
        ru: packFromServer(lesson.id, 'ru', ruPack),
        kk: packFromServer(lesson.id, 'kk', kkPack),
      })
      setContentLang(!lesson.languages?.ru && lesson.languages?.kk ? 'kk' : 'ru')
      setReady(true)
    }).catch((err) => { if (alive) setError(err.message) })
    return () => { alive = false }
  }, [id, isNew, initialSectionId])

  useEffect(() => () => {
    revokeBlobs()
  }, [])

  const active = packs[contentLang]
  const slides = active.slides
  const questions = active.questions
  const videoName = active.videoName
  const videoUrl = active.videoUrl

  function setSlides(updater) {
    updatePack(contentLang, (prev) => ({
      ...prev,
      slides: typeof updater === 'function' ? updater(prev.slides) : updater,
    }))
  }

  function setQuestions(updater) {
    updatePack(contentLang, (prev) => ({
      ...prev,
      questions: typeof updater === 'function' ? updater(prev.questions) : updater,
    }))
  }

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
    const targetLang = contentLang
    setError('')
    setNotice('')
    try {
      const data = await api.importPptx(file, targetLang)
      const next = (data.slides || []).map((slide) => (
        slide.kind === 'frame'
          ? { ...slide, lines: slide.lines?.length ? slide.lines : [''], dirty: false }
          : { ...slide, dirty: false }
      ))
      if (!next.length) throw new Error('В презентации нет слайдов')
      updatePack(targetLang, (prev) => ({ ...prev, slides: next }))
      const firstTitle = next.find((slide) => slide.title)?.title
      if (firstTitle) {
        if (targetLang === 'kk') setTitleKk((current) => current.trim() || firstTitle)
        else setTitle((current) => current.trim() || firstTitle)
      }
      setNotice(data.truncated ? `В урок вошли первые ${next.length} слайдов` : `Загружено слайдов: ${next.length}`)
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
      setError('Нужен ролик MP4, WebM, MOV или OGG')
      return
    }
    if (file.size > 250 * 1024 * 1024) {
      setError('Видео больше 250 МБ')
      return
    }
    setError('')
    revokeBlob(contentLang)
    const nextUrl = URL.createObjectURL(file)
    blobsRef.current[contentLang] = nextUrl
    updatePack(contentLang, (prev) => ({
      ...prev,
      videoFile: file,
      videoName: file.name,
      videoUrl: nextUrl,
      removeVideo: false,
    }))
  }

  function removeVideo() {
    revokeBlob(contentLang)
    updatePack(contentLang, (prev) => ({
      ...prev,
      videoFile: null,
      videoName: '',
      videoUrl: '',
      removeVideo: prev.hasSavedVideo,
    }))
  }

  function clearVersion() {
    revokeBlob(contentLang)
    if (contentLang === 'kk') setTitleKk('')
    else setTitle('')
    updatePack(contentLang, (prev) => ({
      ...emptyPack(),
      hasSavedVideo: prev.hasSavedVideo,
      removeVideo: prev.hasSavedVideo,
    }))
    setError('')
    setNotice('Версия очищена')
  }

  const statuses = {
    ru: packStatus(format, packs.ru),
    kk: packStatus(format, packs.kk),
  }
  const activeTitle = contentLang === 'kk' ? titleKk : title
  const hasContent = Boolean(activeTitle.trim()) || statuses[contentLang] !== 'empty'

  async function save(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (title.trim().length < 2 && titleKk.trim().length < 2) {
      setError('Заполните хотя бы одно название (на русском или казахском)')
      return
    }
    if (!sectionId) {
      setError('Сначала выберите раздел')
      return
    }
    if (statuses.ru === 'partial') {
      setError(format === 'video' ? 'Для русской версии загрузите видео и заполните тест' : 'Для русской версии заполните презентацию и тест')
      return
    }
    if (statuses.kk === 'partial') {
      setError(format === 'video' ? 'Для казахской версии загрузите видео и заполните тест' : 'Для казахской версии заполните презентацию и тест')
      return
    }
    if (statuses.ru === 'empty' && statuses.kk === 'empty') {
      setError('Заполните хотя бы одну языковую версию (русскую или казахскую)')
      return
    }
    const body = {
      title,
      titleKk,
      format,
      sectionId,
      questions: statuses.ru === 'ready' ? packs.ru.questions : [],
      questionsKk: statuses.kk === 'ready' ? packs.kk.questions : [],
    }
    if (format === 'slides') {
      body.slides = statuses.ru === 'ready' ? serializeSlides(packs.ru.slides) : []
      body.slidesKk = statuses.kk === 'ready' ? serializeSlides(packs.kk.slides) : []
    }
    setSaving(true)
    try {
      const lesson = savedId.current
        ? await api.updateLesson(savedId.current, body)
        : await api.createLesson(body)
      savedId.current = lesson.id
      let latest = lesson
      if (format === 'video') {
        for (const code of ['ru', 'kk']) {
          if (packs[code].videoFile) {
            setUploadingLang(code)
            setUploadProgress(0)
            latest = await api.uploadLessonVideo(lesson.id, packs[code].videoFile, setUploadProgress, code)
          } else if (packs[code].removeVideo && packs[code].hasSavedVideo) {
            latest = await api.deleteLessonVideo(lesson.id, code)
          }
        }
      }
      revokeBlobs()
      if (latest?.packs) {
        const stamp = String(Date.now())
        setPacks({
          ru: packFromServer(latest.id, 'ru', latest.packs.ru, stamp),
          kk: packFromServer(latest.id, 'kk', latest.packs.kk, stamp),
        })
      }
      dropStatsCache()
      setNotice('Урок сохранён')
      if (isNew) navigate(`/admin/materials/${lesson.id}`, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
      setUploadProgress(null)
      setUploadingLang('')
    }
  }

  async function remove() {
    try {
      await api.deleteLesson(id)
      dropStatsCache()
      navigate('/admin/materials')
    } catch (err) {
      setError(err.message)
    }
  }

  return {
    isNew,
    title,
    setTitle,
    titleKk,
    setTitleKk,
    contentLang,
    setContentLang,
    format,
    setFormat,
    sections,
    sectionId,
    setSectionId,
    slides,
    setSlides,
    videoName,
    videoUrl,
    saving,
    uploadProgress,
    uploadingLang,
    statuses,
    hasContent,
    questions,
    setQuestions,
    error,
    notice,
    ready,
    patchSlide,
    moveSlide,
    upload,
    pickVideo,
    removeVideo,
    clearVersion,
    save,
    remove,
  }
}
