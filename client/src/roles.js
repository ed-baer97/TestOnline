export function homeFor(role) {
  if (role === 'learner') return '/learn'
  if (role === 'host') return '/host'
  return '/admin'
}

export function roleLabel(role) {
  return {
    super: 'Суперглавный',
    regional: 'Администратор региона',
    org: 'Администратор организации',
    learner: 'Тестируемый',
    host: 'Ведущий',
  }[role] || 'Аккаунт'
}
