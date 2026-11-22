import { useEffect, useState } from 'react'
import { api } from '../../api/index.js'
import { dropStatsCache } from './platformStats.js'

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
export function useLearners(isSuper = false) {
  const [targetsLoaded, setTargetsLoaded] = useState(!isSuper)
  const [regions, setRegions] = useState([])
  const [allOrganizations, setAllOrganizations] = useState([])
  const [regionId, setRegionId] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [tree, setTree] = useState(null)
  const [learners, setLearners] = useState(null)
  const [total, setTotal] = useState(0)
  const [groups, setGroups] = useState([])
  const [filter, setFilter] = useState({ classId: '', search: '' })
  const [searchText, setSearchText] = useState('')
  const [form, setForm] = useState({ displayName: '', login: '', password: '', classId: '' })
  const [bulkMode, setBulkModeState] = useState('list')
  const [bulkClassId, setBulkClassId] = useState(null)
  const [fioText, setFioText] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [imported, setImported] = useState(null)
  const [importing, setImporting] = useState(false)

  const organizations = isSuper
    ? allOrganizations.filter((org) => org.regionId === regionId)
    : []
  const selectedOrganization = isSuper
    ? (allOrganizations.find((org) => org.id === organizationId) || null)
    : null

  function loadGroups(targetOrgId = organizationId) {
    if (isSuper && !targetOrgId) {
      setTree(null)
      setGroups([])
      setForm((current) => ({ ...current, classId: '' }))
      setBulkClassId(null)
      return Promise.resolve()
    }
    return api.structure(isSuper ? targetOrgId : undefined).then((treeData) => {
      const nextGroups = classGroups(treeData.sections)
      const allIds = new Set(nextGroups.flatMap((group) => group.classes.map((item) => item.id)))
      const first = nextGroups[0]?.classes[0]?.id || ''
      setTree(treeData)
      setGroups(nextGroups)
      setForm((current) => ({ ...current, classId: allIds.has(current.classId) ? current.classId : first }))
      setBulkClassId((current) => {
        if (current === '') return ''
        if (current && allIds.has(current)) return current
        return first || null
      })
    })
  }

  function loadPage(offset = 0) {
    if (isSuper && !organizationId) {
      setLearners([])
      setTotal(0)
      return Promise.resolve()
    }
    return api.learners({
      ...(isSuper ? { organizationId } : {}),
      ...filter,
      offset,
      limit: PAGE,
    }).then((data) => {
      setTotal(data.total)
      setLearners((current) => (offset > 0 && current ? [...current, ...data.learners] : data.learners))
    })
  }

  function load() {
    return Promise.all([loadGroups(), loadPage(0)])
  }

  useEffect(() => {
    if (!isSuper) {
      loadGroups().catch((err) => setError(err.message))
      return
    }
    api.learnerTargets().then((data) => {
      setRegions(data.regions)
      setAllOrganizations(data.organizations)
      const firstRegionId = data.regions[0]?.id || ''
      const firstOrgId = data.organizations.find((org) => org.regionId === firstRegionId)?.id || ''
      setRegionId(firstRegionId)
      setOrganizationId(firstOrgId)
      setTargetsLoaded(true)
    }).catch((err) => {
      setTargetsLoaded(true)
      setError(err.message)
    })
  }, [isSuper])

  useEffect(() => {
    if (!isSuper || !targetsLoaded) return
    loadGroups(organizationId).catch((err) => setError(err.message))
  }, [isSuper, targetsLoaded, organizationId])

  useEffect(() => {
    if (isSuper && !targetsLoaded) return
    if (isSuper && !organizationId) {
      setLearners([])
      setTotal(0)
      return
    }
    loadPage(0).catch((err) => setError(err.message))
  }, [isSuper, targetsLoaded, organizationId, filter])

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilter((current) => (current.search === searchText.trim() ? current : { ...current, search: searchText.trim() }))
    }, 300)
    return () => clearTimeout(timer)
  }, [searchText])

  function changeRegion(nextRegionId) {
    const nextOrgId = allOrganizations.find((org) => org.regionId === nextRegionId)?.id || ''
    setRegionId(nextRegionId)
    setOrganizationId(nextOrgId)
    setFilter({ classId: '', search: '' })
    setSearchText('')
    setBulkClassId(null)
    setImported(null)
    setError('')
    setNotice('')
    setLearners(nextOrgId ? null : [])
  }

  function changeOrganization(nextOrgId) {
    setOrganizationId(nextOrgId)
    setFilter({ classId: '', search: '' })
    setSearchText('')
    setBulkClassId(null)
    setImported(null)
    setError('')
    setNotice('')
    setLearners(nextOrgId ? null : [])
  }

  function setBulkMode(mode) {
    setBulkModeState(mode)
    if (mode === 'list' && !bulkClassId) {
      const first = groups[0]?.classes[0]?.id || ''
      if (first) setBulkClassId(first)
    }
  }

  function patch(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function quickCreateTrack(name) {
    setError('')
    setNotice('')
    const created = await api.createTrack({ name, ...(isSuper ? { organizationId } : {}) })
    dropStatsCache()
    await loadGroups()
    setNotice('Курс создан')
    return created
  }

  async function quickCreateClass(body) {
    setError('')
    setNotice('')
    const created = await api.createClass({ ...body, ...(isSuper ? { organizationId } : {}) })
    dropStatsCache()
    await loadGroups()
    setForm((current) => ({ ...current, classId: created.id }))
    setBulkClassId(created.id)
    setNotice('Класс добавлен')
    return created
  }

  async function create(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      const created = await api.createLearner({
        ...form,
        ...(isSuper ? { organizationId } : {}),
      })
      dropStatsCache()
      setForm((current) => ({ ...current, displayName: '', login: '', password: '' }))
      const shownPassword = created.password || form.password
      setNotice(
        shownPassword
          ? `Тестируемый создан. Логин: ${created.login}. Пароль: ${shownPassword}.`
          : 'Тестируемый создан. Передайте логин и пароль.',
      )
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
      dropStatsCache()
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function registerList(event, orgLabel = '') {
    event.preventDefault()
    setError('')
    setNotice('')
    setImported(null)
    setImporting(true)
    try {
      const data = await api.bulkLearners({
        ...(isSuper ? { organizationId } : {}),
        classId: bulkClassId || '',
        text: fioText,
      })
      dropStatsCache()
      setImported({ ...data, organizationName: orgLabel })
      if (data.created) {
        setFioText('')
        setNotice(`Создано тестируемых: ${data.created}. Сохраните таблицу с паролями: повторно их увидеть нельзя.`)
      }
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  async function upload(event, orgLabel = '') {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    setNotice('')
    setImported(null)
    setImporting(true)
    try {
      const data = await api.importLearners(file, {
        ...(isSuper ? { organizationId } : {}),
        ...(bulkClassId ? { classId: bulkClassId } : {}),
      })
      dropStatsCache()
      setImported({ ...data, organizationName: orgLabel })
      if (data.created) setNotice(`Создано тестируемых: ${data.created}. Сохраните таблицу с паролями: повторно их увидеть нельзя.`)
      else if (!data.errors?.length) setNotice('В файле не нашлось новых тестируемых')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  async function exportExcel(lang, translateClassLabel) {
    if (!imported?.learners?.length) return null
    return api.exportLearnersExcel({
      learners: imported.learners.map((person) => ({
        ...person,
        classLabel: translateClassLabel(person.classLabel),
      })),
      lang,
      organizationName: imported.organizationName || '',
    })
  }

  async function saveLearner(id, body) {
    const saved = await api.updateLearner(id, body)
    dropStatsCache()
    return saved
  }

  return {
    targetsLoaded,
    regions,
    organizations,
    regionId,
    changeRegion,
    organizationId,
    changeOrganization,
    selectedOrganization,
    tree,
    learners,
    total,
    groups,
    filter,
    setFilter,
    searchText,
    setSearchText,
    form,
    bulkMode,
    setBulkMode,
    bulkClassId,
    setBulkClassId,
    fioText,
    setFioText,
    error,
    setError,
    notice,
    imported,
    setImported,
    importing,
    loadPage,
    load,
    patch,
    quickCreateTrack,
    quickCreateClass,
    create,
    remove,
    registerList,
    upload,
    exportExcel,
    saveLearner,
  }
}
