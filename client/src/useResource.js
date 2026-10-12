import { useCallback, useEffect, useRef, useState } from 'react'

const cache = new Map()
const DEFAULT_TTL = 60_000

export function dropResource(prefix = '') {
  for (const key of [...cache.keys()]) if (key.startsWith(prefix)) cache.delete(key)
}

// Загружает данные по ключу и держит их в памяти: повторный заход показывает
// сохранённый ответ сразу, свежий подтягивается в фоне.
export function useResource(key, loader, { ttl = DEFAULT_TTL } = {}) {
  const [state, setState] = useState(() => {
    const hit = cache.get(key)
    return { key, data: hit?.data ?? null, error: '', loading: !hit }
  })
  const [tick, setTick] = useState(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    let alive = true
    const known = cache.get(key)
    const fresh = known && tick === 0 && Date.now() - known.at < ttl
    setState({ key, data: known?.data ?? null, error: '', loading: !known })
    if (fresh) return () => { alive = false }
    Promise.resolve()
      .then(() => loaderRef.current())
      .then((data) => {
        cache.set(key, { data, at: Date.now() })
        if (alive) setState({ key, data, error: '', loading: false })
      })
      .catch((err) => {
        if (alive) setState((current) => ({ key, data: current.key === key ? current.data : null, error: err.message || 'Ошибка запроса', loading: false }))
      })
    return () => { alive = false }
  }, [key, ttl, tick])

  const reload = useCallback(() => setTick((value) => value + 1), [])

  if (state.key !== key) {
    const hit = cache.get(key)
    return { data: hit?.data ?? null, error: '', loading: !hit, reload }
  }
  return { data: state.data, error: state.error, loading: state.loading, reload }
}
