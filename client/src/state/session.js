import { useEffect, useRef, useState } from 'react'
import { api } from '../api/index.js'
import { homeFor } from '../lib/roles.js'
import { dropResource } from './resource.js'

// undefined — профиль ещё грузится, null — вход не выполнен.
export function useSession() {
  const [me, setMe] = useState(undefined)

  useEffect(() => {
    let alive = true
    api.me()
      .then((data) => { if (alive) setMe(data.ok ? data : null) })
      .catch(() => { if (alive) setMe(null) })
    return () => { alive = false }
  }, [])

  return me
}

export async function signOut() {
  try {
    await api.logout()
  } catch {
    // Выход в UI и очистка кеша должны срабатывать даже при сетевой ошибке.
  } finally {
    dropResource()
  }
}

// Если вход уже выполнен, страница входа сразу уводит на главную страницу роли.
export function useLogin(navigate) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let alive = true
    api.me().then((data) => {
      if (alive && data.ok) navigate(homeFor(data.role), { replace: true })
    }).catch(() => {})
    return () => { alive = false }
  }, [navigate])

  async function submit(event) {
    event.preventDefault()
    setError('')
    setPending(true)
    try {
      const data = await api.login(login, password)
      dropResource()
      navigate(homeFor(data.role))
    } catch (err) {
      setError(err.message)
    } finally {
      setPending(false)
    }
  }

  return { login, setLogin, password, setPassword, error, pending, submit }
}

export function useRegister(navigate) {
  const [roles, setRoles] = useState([{ id: 'org', label: 'Директор школы' }])
  const [regions, setRegions] = useState([])
  const [allDistricts, setAllDistricts] = useState([])
  const [allOrganizations, setAllOrganizations] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [role, setRole] = useState('org')
  const [regionId, setRegionId] = useState('')
  const [districtId, setDistrictId] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [created, setCreated] = useState(null)
  const registeredRef = useRef(false)

  useEffect(() => {
    let alive = true
    api.me().then((data) => {
      if (alive && data.ok && !registeredRef.current) navigate(homeFor(data.role), { replace: true })
    }).catch(() => {})
    api.registerOptions().then((data) => {
      if (!alive) return
      const nextRoles = data.roles?.length ? data.roles : [{ id: 'org', label: 'Директор школы' }]
      const nextRegions = data.regions || []
      const nextDistricts = data.districts || []
      const nextOrgs = data.organizations || []
      const firstRegionId = nextRegions[0]?.id || ''
      const firstOrgId = nextOrgs.find((org) => org.regionId === firstRegionId)?.id || ''
      setRoles(nextRoles)
      setRegions(nextRegions)
      setAllDistricts(nextDistricts)
      setAllOrganizations(nextOrgs)
      setRole(nextRoles[0].id)
      setRegionId(firstRegionId)
      setDistrictId('')
      setOrganizationId(firstOrgId)
      setLoaded(true)
    }).catch((err) => {
      if (alive) {
        setLoaded(true)
        setError(err.message)
      }
    })
    return () => { alive = false }
  }, [navigate])

  const districts = allDistricts.filter((item) => item.regionId === regionId)
  const organizations = allOrganizations.filter((item) => (
    item.regionId === regionId && (!districtId || item.districtId === districtId)
  ))

  function changeRegion(nextRegionId) {
    const nextOrgId = allOrganizations.find((item) => item.regionId === nextRegionId)?.id || ''
    setRegionId(nextRegionId)
    setDistrictId('')
    setOrganizationId(nextOrgId)
  }

  function changeDistrict(nextDistrictId) {
    const nextOrgId = allOrganizations.find((item) => (
      item.regionId === regionId && (!nextDistrictId || item.districtId === nextDistrictId)
    ))?.id || ''
    setDistrictId(nextDistrictId)
    setOrganizationId(nextOrgId)
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setPending(true)
    try {
      const data = await api.register({ role, organizationId, firstName, lastName, email, password })
      dropResource()
      registeredRef.current = true
      setCreated(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setPending(false)
    }
  }

  function enterCabinet() {
    if (!created) return
    navigate(homeFor(created.role), { replace: true })
  }

  return {
    loaded,
    roles,
    regions,
    districts,
    organizations,
    role,
    setRole,
    regionId,
    changeRegion,
    districtId,
    changeDistrict,
    organizationId,
    setOrganizationId,
    firstName,
    setFirstName,
    lastName,
    setLastName,
    email,
    setEmail,
    password,
    setPassword,
    error,
    pending,
    created,
    submit,
    enterCabinet,
  }
}
