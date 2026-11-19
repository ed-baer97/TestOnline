import { useI18n } from '../state/i18n.jsx'

export function LanguageToggle() {
  const { lang, setLang, t } = useI18n()
  return (
    <div className="lang-toggle" role="group" aria-label={t('Язык')}>
      <button type="button" className={lang === 'ru' ? 'on' : ''} aria-pressed={lang === 'ru'} onClick={() => setLang('ru')}>Рус</button>
      <button type="button" className={lang === 'kk' ? 'on' : ''} aria-pressed={lang === 'kk'} onClick={() => setLang('kk')}>Қаз</button>
    </div>
  )
}
