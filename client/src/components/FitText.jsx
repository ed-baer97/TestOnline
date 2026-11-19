import { useLayoutEffect, useRef } from 'react'

// Подбирает размер шрифта так, чтобы текст целиком поместился в карточку ответа.
export function FitText({ text, min = 13, max = 28 }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const node = ref.current
    const box = node?.closest('.answer')
    if (!node || !box) return

    const fit = () => {
      let low = min
      let high = max
      let best = min
      while (low <= high) {
        const mid = Math.floor((low + high) / 2)
        node.style.fontSize = `${mid}px`
        if (box.scrollHeight <= box.clientHeight + 1) {
          best = mid
          low = mid + 1
        } else {
          high = mid - 1
        }
      }
      node.style.fontSize = `${best}px`
    }

    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(box)
    return () => observer.disconnect()
  }, [text, min, max])

  return <span ref={ref} className="fit-text">{text}</span>
}
