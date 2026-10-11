import { useEffect, useState } from 'react'

// Выбор темы хранится в localStorage под ключом theme; index.html читает его до загрузки скриптов.
const STORAGE_KEY = 'theme'

export function currentTheme() {
  const saved = document.documentElement.dataset.theme
  return saved === 'light' || saved === 'dark' ? saved : 'dark'
}

function paint(theme) {
  document.documentElement.dataset.theme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f4f8fc' : '#071422')
}

export function useTheme() {
  const [theme, setTheme] = useState(currentTheme)

  useEffect(() => {
    paint(theme)
  }, [theme])

  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light'
    localStorage.setItem(STORAGE_KEY, next)
    setTheme(next)
  }

  return { theme, toggle }
}
