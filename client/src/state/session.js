import { useEffect, useState } from 'react'
import { api } from '../api/index.js'

// undefined — профиль ещё грузится, null — вход не выполнен.
export function useSession() {
  const [me, setMe] = useState(undefined)

  useEffect(() => {
    api.me().then((data) => setMe(data.ok ? data : null)).catch(() => setMe(null))
  }, [])

  return me
}

export async function signOut() {
  await api.logout()
}
