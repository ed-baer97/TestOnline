import { useLayoutEffect, useRef } from 'react'

// Легенда вопроса сжимается до самой узкой ширины, при которой текст занимает столько же строк.
export function FitLegend({ children }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    const parent = el?.parentElement
    if (!el || !parent) return undefined
    const fit = () => {
      const available = parent.clientWidth
      if (el.dataset.available === String(available)) return
      el.style.width = '100%'
      const max = el.offsetWidth
      const height = el.offsetHeight
      let low = 0
      let high = max
      while (low + 1 < high) {
        const mid = Math.floor((low + high) / 2)
        el.style.width = `${mid}px`
        if (el.offsetHeight > height) low = mid
        else high = mid
      }
      el.style.width = `${high}px`
      el.dataset.available = String(available)
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [children])
  return <legend ref={ref}>{children}</legend>
}
