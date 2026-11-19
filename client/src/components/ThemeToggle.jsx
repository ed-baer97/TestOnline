import { useI18n } from '../state/i18n.jsx'
import { useTheme } from '../state/theme.js'

export function ThemeToggle() {
  const { t } = useI18n()
  const { theme, toggle } = useTheme()
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
