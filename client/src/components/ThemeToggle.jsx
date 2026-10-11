import { useTheme } from '../state/theme.js'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
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
