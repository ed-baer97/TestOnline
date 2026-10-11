import { fail } from './errors.js'

export function assertRole(actor, ...roles) {
  if (!actor || !roles.includes(actor.role)) fail('Недостаточно прав', 403)
}
