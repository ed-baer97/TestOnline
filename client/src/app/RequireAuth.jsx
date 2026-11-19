import { Navigate } from 'react-router-dom'
import { homeFor } from '../lib/roles.js'
import { useI18n } from '../state/i18n.jsx'
import { useSession } from '../state/session.js'

export function RequireAuth({ roles, children }) {
  const { t } = useI18n()
  const me = useSession()

  if (me === undefined) return <p className="center muted">{t('Загрузка…')}</p>
  if (!me) return <Navigate to="/login" replace />
  if (roles && !roles.includes(me.role)) return <Navigate to={homeFor(me.role)} replace />
  return children
}
