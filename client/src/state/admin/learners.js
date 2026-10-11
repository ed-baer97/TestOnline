import { useEffect, useState } from 'react'
import { api } from '../../api/index.js'

const PAGE = 100

function classGroups(sections) {
  const groups = []
  for (const section of sections || []) {
    if (section.kind === 'school') {
      for (const grade of section.grades) {
        if (grade.classes.length) groups.push({ label: grade.label, classes: grade.classes })
      }
    } else {
      for (const track of section.tracks) {
        if (track.classes.length) groups.push({ label: track.name, classes: track.classes })
      }
    }
  }
  return groups
}

// Список тестируемых: фильтр по классу, поиск с задержкой 300 мс, подгрузка по 100.
export function useLearners() {
  const [learners, setLearners] = useState(null)
  const [total, setTotal] = useState(0)
  const [groups, setGroups] = useState([])
  const [filter, setFilter] = useState({ classId: '', search: '' })
  const [searchText, setSearchText] = useState('')
  const [form, setForm] = useState({ displayName: '', login: '', password: '', classId: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [imported, setImported] = useState(null)
  const [importing, setImporting] = useState(false)

  function loadGroups() {
    return api.structure().then((tree) => {
      const nextGroups = classGroups(tree.sections)
      const first = nextGroups[0]?.classes[0]?.id || ''
      setGroups(nextGroups)
      setForm((current) => ({ ...current, classId: current.classId || first }))
    })
  }

  function loadPage(offset = 0) {
    return api.learners({ ...filter, offset, limit: PAGE }).then((data) => {
      setTotal(data.total)
      setLearners((current) => (offset > 0 && current ? [...current, ...data.learners] : data.learners))
    })
  }

  function load() {
    return Promise.all([loadGroups(), loadPage(0)])
  }

  useEffect(() => {
    loadGroups().catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    loadPage(0).catch((err) => setError(err.message))
  }, [filter])

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilter((current) => (current.search === searchText.trim() ? current : { ...current, search: searchText.trim() }))
    }, 300)
    return () => clearTimeout(timer)
  }, [searchText])

  function patch(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function create(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      await api.createLearner(form)
      setForm((current) => ({ ...current, displayName: '', login: '', password: '' }))
      setNotice('Тестируемый создан. Передайте логин и пароль.')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(person) {
    setError('')
    setNotice('')
    try {
      await api.deleteLearner(person.id)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function upload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    setNotice('')
    setImported(null)
    setImporting(true)
    try {
      const data = await api.importLearners(file)
      setImported(data)
      if (data.created) setNotice(`Создано тестируемых: ${data.created}. Сохраните таблицу с паролями: повторно их увидеть нельзя.`)
      else if (!data.errors?.length) setNotice('В файле не нашлось новых тестируемых')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  function saveLearner(id, body) {
    return api.updateLearner(id, body)
  }

  return {
    learners,
    total,
    groups,
    filter,
    setFilter,
    searchText,
    setSearchText,
    form,
    error,
    setError,
    notice,
    imported,
    setImported,
    importing,
    loadPage,
    load,
    patch,
    create,
    remove,
    upload,
    saveLearner,
  }
}
