import { useEffect, useState } from 'react'
import { api } from '../../api/index.js'
import { EMPTY_GROUPS } from '../../lib/bands.js'
import { dropStatsCache } from './platformStats.js'

export function useOrganizations() {
  const [organizations, setOrganizations] = useState(null)
  const [districts, setDistricts] = useState([])
  const [name, setName] = useState('')
  const [nameKk, setNameKk] = useState('')
  const [districtId, setDistrictId] = useState('')
  const [districtName, setDistrictName] = useState('')
  const [districtNameKk, setDistrictNameKk] = useState('')
  const [groups, setGroups] = useState(EMPTY_GROUPS)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState(null)

  function load() {
    return Promise.all([api.organizations(), api.districts()]).then(([data, area]) => {
      setOrganizations(data.organizations)
      setDistricts(area.districts)
      setDistrictId((current) => current || area.districts[0]?.id || '')
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
      await api.createOrganization({
        name,
        nameKk,
        districtId: districts.length ? districtId : undefined,
        groups,
      })
      dropStatsCache()
      setName('')
      setNameKk('')
      setGroups(EMPTY_GROUPS)
      setNotice('Организация создана')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(org) {
    setError('')
    setNotice('')
    try {
      await api.deleteOrganization(org.id)
      dropStatsCache()
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function addDistrict(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      const created = await api.createDistrict({ name: districtName, nameKk: districtNameKk })
      dropStatsCache()
      setDistrictName('')
      setDistrictNameKk('')
      setDistrictId(created.id)
      setNotice('Район создан')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function removeDistrict(district) {
    setError('')
    setNotice('')
    try {
      await api.deleteDistrict(district.id)
      dropStatsCache()
      if (districtId === district.id) setDistrictId('')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function seedCatalog() {
    setError('')
    setNotice('')
    try {
      const result = await api.seedCatalog()
      dropStatsCache()
      setNotice(result.already ? 'Каталог уже загружен' : `Загружено школ: ${result.schools}`)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function saveOrganization(id, body) {
    const saved = await api.updateOrganization(id, body)
    dropStatsCache()
    return saved
  }

  async function organizationSaved() {
    setNotice('Организация сохранена')
    setEditing(null)
    await load()
  }

  return {
    organizations,
    districts,
    name,
    setName,
    nameKk,
    setNameKk,
    districtId,
    setDistrictId,
    districtName,
    setDistrictName,
    districtNameKk,
    setDistrictNameKk,
    groups,
    setGroups,
    error,
    setError,
    notice,
    editing,
    setEditing,
    create,
    remove,
    addDistrict,
    removeDistrict,
    seedCatalog,
    saveOrganization,
    organizationSaved,
  }
}

export function useOrgStaff() {
  const [admins, setAdmins] = useState(null)
  const [organizations, setOrganizations] = useState([])
  const [form, setForm] = useState({ displayName: '', login: '', password: '', organizationId: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function load() {
    return Promise.all([api.orgAdmins(), api.organizations()]).then(([people, orgs]) => {
      setAdmins(people.admins)
      setOrganizations(orgs.organizations)
      setForm((current) => ({
        ...current,
        organizationId: current.organizationId || orgs.organizations[0]?.id || '',
      }))
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
      await api.createOrgAdmin(form)
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
      await api.deleteOrgAdmin(person.id)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  function saveAdmin(id, body) {
    return api.updateOrgAdmin(id, body)
  }

  return { admins, organizations, form, error, setError, notice, load, patch, create, remove, saveAdmin }
}
