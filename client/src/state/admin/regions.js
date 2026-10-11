import { useEffect, useState } from 'react'
import { api } from '../../api/index.js'

export function useRegions() {
  const [regions, setRegions] = useState(null)
  const [name, setName] = useState('')
  const [drafts, setDrafts] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function load() {
    return api.regions().then((data) => {
      setRegions(data.regions)
      setDrafts(Object.fromEntries(data.regions.map((region) => [region.id, region.name])))
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
      await api.createRegion({ name })
      setName('')
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
      await api.updateRegion(id, { name: drafts[id] })
      setNotice('Название сохранено')
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
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return { regions, name, setName, drafts, setDrafts, error, notice, create, rename, remove }
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
