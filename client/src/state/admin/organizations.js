import { useEffect, useState } from 'react'
import { api } from '../../api/index.js'
import { EMPTY_GROUPS } from '../../lib/bands.js'

export function useOrganizations() {
  const [organizations, setOrganizations] = useState(null)
  const [name, setName] = useState('')
  const [groups, setGroups] = useState(EMPTY_GROUPS)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState(null)

  function load() {
    return api.organizations().then((data) => setOrganizations(data.organizations))
  }

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [])

  async function create(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      await api.createOrganization({ name, groups })
      setName('')
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
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  function saveOrganization(id, body) {
    return api.updateOrganization(id, body)
  }

  async function organizationSaved() {
    setNotice('Организация сохранена')
    setEditing(null)
    await load()
  }

  return {
    organizations,
    name,
    setName,
    groups,
    setGroups,
    error,
    setError,
    notice,
    editing,
    setEditing,
    create,
    remove,
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
