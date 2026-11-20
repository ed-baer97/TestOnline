import { assertRole } from '../../domain/access.js'
import { fail } from '../../domain/errors.js'
import { classCaption } from '../../domain/structure.js'
import * as classesRepo from '../../repositories/classes.js'
import * as orgsRepo from '../../repositories/organizations.js'
import { getLaunchQuiz, getQuiz, listSuperQuizzes } from '../quizzes.js'

export async function launchTargets(actor) {
  let orgRows
  if (actor?.role === 'super') {
    orgRows = await orgsRepo.listAllOrganizationNames()
  } else if (actor?.role === 'regional') {
    orgRows = await orgsRepo.listRegionOrganizationNames(actor.regionId)
  } else if (actor?.role === 'org') {
    const row = await orgsRepo.findOrganizationName(actor.organizationId)
    orgRows = row ? [row] : []
  } else {
    fail('Недостаточно прав', 403)
  }
  if (!orgRows.length) return []
  const classes = await classesRepo.listClassesForLaunch(orgRows.map((org) => org.id))
  return orgRows
    .map((org) => ({
      id: org.id,
      name: org.name,
      nameKk: org.name_kk || '',
      classes: classes
        .filter((item) => item.organization_id === org.id)
        .map((item) => ({ id: item.id, label: classCaption(item), band: item.band }))
        .sort((a, b) => String(a.label).localeCompare(String(b.label), 'ru')),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

export async function listLaunchQuizzes(actor) {
  assertRole(actor, 'super', 'regional', 'org')
  return listSuperQuizzes()
}

export async function quizForRoom(actor, quizId, mode) {
  const priv = mode === 'private'
  if (actor?.role === 'host') {
    if (priv) fail('Недостаточно прав', 403)
    const quiz = await getQuiz(quizId, actor.id)
    if (!quiz) fail('Квиз не найден', 404)
    return quiz
  }
  if (actor?.role === 'super') {
    const quiz = await getQuiz(quizId, actor.id)
    if (!quiz) fail('Квиз не найден', 404)
    return quiz
  }
  if (actor?.role === 'regional' || actor?.role === 'org') {
    if (!priv) fail('Выберите класс')
    const quiz = await getLaunchQuiz(quizId)
    if (!quiz) fail('Квиз не найден', 404)
    return quiz
  }
  fail('Недостаточно прав', 403)
}

export async function privateAudience(actor, organizationId, classId) {
  const targets = await launchTargets(actor)
  const org = targets.find((item) => item.id === organizationId)
  if (!org) fail('Выберите организацию')
  const klass = org.classes.find((item) => item.id === classId)
  if (!klass) fail('Выберите класс')
  return {
    kind: 'private',
    organizationId: org.id,
    classId: klass.id,
    band: klass.band,
    organizationName: org.name,
    organizationNameKk: org.nameKk || '',
    classLabel: klass.label,
  }
}
