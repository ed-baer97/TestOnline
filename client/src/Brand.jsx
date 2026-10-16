import { Link } from 'react-router-dom'

export function Brand({ to }) {
  const mark = <img className="brand-mark" src="/department-logo.png?v=afm" alt="Saqbol" />
  if (!to) return <p className="brand">{mark}</p>
  return <Link className="brand" to={to}>{mark}</Link>
}
