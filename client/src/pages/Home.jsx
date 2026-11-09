import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brand } from '../Brand.jsx'
import { useI18n } from '../i18n.jsx'
import { EnvControls } from '../topbar.jsx'

const FEATURES = [
  {
    title: 'Звонки и сообщения',
    text: '«Служба безопасности банка», выигрыш в лотерею, друг просит занять до завтра. Разбираем, по каким мелочам видно обман.',
  },
  {
    title: 'Карта, коды и пароли',
    text: 'Что можно сказать по телефону, а что нельзя никому. Даже если собеседник знает твоё имя и номер карты.',
  },
  {
    title: 'Свои деньги',
    text: 'Как распорядиться карманными и первой стипендией, зачем откладывать и почему «лёгкий заработок» в интернете почти всегда ловушка.',
  },
]

const STEPS = [
  { title: 'Получаешь логин', text: 'Его выдаёт учитель или администратор школы.' },
  { title: 'Смотришь урок', text: 'Слайды или короткое видео, минут на десять.' },
  { title: 'Отвечаешь на вопросы', text: 'Сразу видно, где ошибся. Результат сохраняется.' },
]

export default function Home() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [pin, setPin] = useState('')

  function joinByCode(event) {
    event.preventDefault()
    const clean = pin.replace(/\D/g, '').slice(0, 6)
    if (clean.length === 6) navigate(`/play/${clean}`)
  }

  return (
    <div className="landing">
      <header className="landing-bar">
        <Brand />
        <div className="top-actions">
          <EnvControls />
          <Link className="ghost" to="/login">{t('Войти')}</Link>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-copy">
            <p className="eyebrow">{t('Для школ и вузов')}</p>
            <h1>{t('Сначала подумай,')}<br />{t('потом переводи')}</h1>
            <p className="lead">{t('Короткие уроки о том, как не остаться без денег: звонок «из банка», ссылка от «друга», код из СМС. В конце пара вопросов, чтобы проверить себя.')}</p>
            <div className="home-actions">
              <Link className="primary" to="/login">{t('Войти в кабинет')}</Link>
            </div>
            <form className="join-form" onSubmit={joinByCode}>
              <label>
                <span className="muted">{t('Есть код квиза?')}</span>
                <input
                  inputMode="numeric"
                  placeholder="000 000"
                  maxLength={7}
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                />
              </label>
              <button className="ghost" type="submit" disabled={pin.replace(/\D/g, '').length < 6}>
                {t('Войти в игру')}
              </button>
            </form>
          </div>

          <aside className="landing-preview" aria-hidden="true">
            <article className="slide orbit">
              <p className="slide-kicker">{t('Ситуация')}</p>
              <h2>{t('«Мам, срочно скинь денег»')}</h2>
              <ul>
                <li>{t('Пишут с незнакомого номера')}</li>
                <li>{t('Торопят и просят никому не говорить')}</li>
                <li>{t('Перезвони маме на её номер')}</li>
              </ul>
            </article>
            <div className="landing-float">
              <span>{t('Твой результат')}</span>
              <strong>{t('8 из 10')}</strong>
            </div>
          </aside>
        </section>

        <section className="landing-block" aria-labelledby="features-title">
          <h2 id="features-title">{t('О чём уроки')}</h2>
          <div className="feature-grid">
            {FEATURES.map((feature) => (
              <article className="feature" key={feature.title}>
                <h3>{t(feature.title)}</h3>
                <p>{t(feature.text)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-block" aria-labelledby="steps-title">
          <h2 id="steps-title">{t('Как это устроено')}</h2>
          <ol className="step-grid">
            {STEPS.map((step) => (
              <li key={step.title}>
                <h3>{t(step.title)}</h3>
                <p>{t(step.text)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-close">
          <div>
            <h2>{t('Попробуй первый урок')}</h2>
            <p className="muted">{t('Логин и пароль выдаёт учитель или администратор школы.')}</p>
          </div>
          <Link className="primary" to="/login">{t('Войти')}</Link>
        </section>
      </main>
    </div>
  )
}

