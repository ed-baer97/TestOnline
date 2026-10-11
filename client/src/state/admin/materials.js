import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/index.js'
import { EMPTY_GROUPS } from '../../lib/bands.js'
import { newId } from '../../lib/ids.js'

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

export function useMaterialList() {
  const [lessons, setLessons] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.lessons().then((data) => setLessons(data.lessons)).catch((err) => setError(err.message))
  }, [])

  return { lessons, error }
}

// Редактор урока. После первого сохранения урок обновляется по savedId, а новый адрес подменяет /new.
export function useLessonEditor(id, navigate) {
  const isNew = !id
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
    if (file.size > 80 * 1024 * 1024) {
      setError('Видео больше 80 МБ')
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
      setError('Загрузите видео')
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
      setNotice('Урок сохранён')
      if (isNew) navigate(`/admin/materials/${lesson.id}`, { replace: true })
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove() {
    try {
      await api.deleteLesson(id)
      navigate('/admin/materials')
    } catch (err) {
      setError(err.message)
    }
  }

  return {
    isNew,
    title,
    setTitle,
    format,
    setFormat,
    groups,
    setGroups,
    slides,
    setSlides,
    videoName,
    videoUrl,
    questions,
    setQuestions,
    error,
    notice,
    ready,
    patchSlide,
    moveSlide,
    upload,
    pickVideo,
    save,
    remove,
  }
}
