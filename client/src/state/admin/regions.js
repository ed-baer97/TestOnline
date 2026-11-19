import { useEffect, useState } from 'react'
import { api } from '../../api/index.js'
import { dropStatsCache } from './platformStats.js'

export function useRegions() {
  const [regions, setRegions] = useState(null)
  const [name, setName] = useState('')
  const [nameKk, setNameKk] = useState('')
  const [drafts, setDrafts] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function load() {
    return api.regions().then((data) => {
      setRegions(data.regions)
      setDrafts(Object.fromEntries(data.regions.map((region) => [region.id, { name: region.name, nameKk: region.nameKk || '' }])))
    })
  }

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [])

  async function create(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      await api.createRegion({ name, nameKk })
      dropStatsCache()
      setName('')
      setNameKk('')
      setNotice('Регион создан')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function rename(event, id) {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      await api.updateRegion(id, drafts[id] || { name: '', nameKk: '' })
      dropStatsCache()
      setNotice('Название сохранено')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function seed(region) {
    setError('')
    setNotice('')
    try {
      const result = await api.seedCatalog(region.id)
      dropStatsCache()
      setNotice(result.already ? 'Каталог уже загружен' : `Загружено школ: ${result.schools}`)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(region) {
    setError('')
    setNotice('')
    try {
      await api.deleteRegion(region.id)
      dropStatsCache()
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return { regions, name, setName, nameKk, setNameKk, drafts, setDrafts, error, notice, create, rename, seed, remove }
}

export function useRegionalStaff() {
  const [admins, setAdmins] = useState(null)
  const [regions, setRegions] = useState([])
  const [form, setForm] = useState({ displayName: '', login: '', password: '', regionId: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function load() {
    return Promise.all([api.regionalAdmins(), api.regions()]).then(([people, regionData]) => {
      setAdmins(people.admins)
      setRegions(regionData.regions)
      setForm((current) => ({ ...current, regionId: current.regionId || regionData.regions[0]?.id || '' }))
    })
  }

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [])

  function patch(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function create(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      await api.createRegionalAdmin(form)
      setForm((current) => ({ ...current, displayName: '', login: '', password: '' }))
      setNotice('Администратор создан. Передайте ему логин и пароль.')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(person) {
    setError('')
    setNotice('')
    try {
      await api.deleteRegionalAdmin(person.id)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  function saveAdmin(id, body) {
    return api.updateRegionalAdmin(id, body)
  }

  return { admins, regions, form, error, setError, notice, load, patch, create, remove, saveAdmin }
}
