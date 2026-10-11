import { useEffect, useState } from 'react'
import { useI18n } from './i18n.jsx'

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

export function ThemeToggle() {
  const { t } = useI18n()
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
      aria-label={light ? t('Включить тёмную тему') : t('Включить светлую тему')}
    >
      {light ? t('Тёмная') : t('Светлая')}
    </button>
  )
}
