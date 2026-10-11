import { Link } from 'react-router-dom'
import { useI18n } from '../i18n.jsx'

const FEATURES = [
  {
    title: 'Школа и вуз',
    text: 'Финансовая безопасность для школьников и студентов. Урок назначается классу или студенческой группе.',
  },
  {
    title: 'Деньги и мошенничество',
    text: 'Бюджет и траты, звонки и ссылки, карта и пароль. Урок — слайды или видео.',
  },
  {
    title: 'Проверка после урока',
    text: 'Вопросы по материалу — и школьнику, и студенту. Балл сохраняется: сколько верных ответов из скольких.',
  },
]

export default function Home() {
  const { t } = useI18n()
  return (
    <div className="landing">
      <header className="landing-bar">
        <p className="brand">TestOnline</p>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-copy">
            <p className="eyebrow">{t('Обучающая платформа')}</p>
            <h1>{t('Финансовая')}<br />{t('безопасность')}</h1>
            <div className="home-actions">
              <Link className="primary" to="/login">{t('Войти в платформу')}</Link>
            </div>
          </div>

          <aside className="landing-preview" aria-hidden="true">
            <article className="slide orbit">
              <p className="slide-kicker">{t('Школа и вуз')}</p>
              <h2>{t('Срочный перевод')}</h2>
              <ul>
                <li>{t('Просят деньги, код или данные карты')}</li>
                <li>{t('Ссылку из сообщения не открывать')}</li>
                <li>{t('Сначала проверить, потом отвечать')}</li>
              </ul>
            </article>
            <div className="landing-float">
              <span>{t('Проверка')}</span>
              <strong>{t('8 из 10')}</strong>
            </div>
          </aside>
        </section>

        <section className="landing-block" aria-labelledby="features-title">
          <h2 id="features-title">{t('Чему учим')}</h2>
          <div className="feature-grid">
            {FEATURES.map((feature) => (
              <article className="feature" key={feature.title}>
                <h3>{t(feature.title)}</h3>
                <p>{t(feature.text)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-close">
          <div>
            <h2>{t('Откройте уроки по финансовой безопасности')}</h2>
          </div>
          <Link className="primary" to="/login">{t('Войти')}</Link>
        </section>
      </main>
    </div>
  )
}
