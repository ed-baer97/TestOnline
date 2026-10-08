import { useEffect, useState } from 'react'

const STORAGE_KEY = 'theme'

export function currentTheme() {
  const saved = document.documentElement.dataset.theme
  return saved === 'light' || saved === 'dark' ? saved : 'dark'
}

function paint(theme) {
  document.documentElement.dataset.theme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f6f3ec' : '#12141c')
}

export function ThemeToggle() {
  const [theme, setTheme] = useState(currentTheme)

  useEffect(() => {
    paint(theme)
  }, [theme])

  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light'
    localStorage.setItem(STORAGE_KEY, next)
    setTheme(next)
  }

  const light = theme === 'light'
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-pressed={light}
      aria-label={light ? 'Включить тёмную тему' : 'Включить светлую тему'}
    >
      {light ? 'Тёмная' : 'Светлая'}
    </button>
  )
}
