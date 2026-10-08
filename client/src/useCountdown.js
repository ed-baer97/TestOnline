import { useEffect, useState } from 'react'

export function useCountdown(endsAt, serverNow) {
  const [leftMs, setLeftMs] = useState(null)

  useEffect(() => {
    if (!endsAt) {
      setLeftMs(null)
      return undefined
    }
    const offset = (serverNow || Date.now()) - Date.now()
    const tick = () => setLeftMs(Math.max(0, endsAt - (Date.now() + offset)))
    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [endsAt, serverNow])

  if (leftMs == null) return null
  return Math.ceil(leftMs / 1000)
}
