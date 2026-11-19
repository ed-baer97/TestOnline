import { assertRole } from '../../domain/access.js'
import { fail } from '../../domain/errors.js'
import { BANDS, classCaption } from '../../domain/structure.js'
import * as classesRepo from '../../repositories/classes.js'
import * as statsRepo from '../../repositories/platformStats.js'
import { mustOrg, mustRegion, orgInRegion } from './scope.js'

function rateOf(score) {
  if (!score?.answered) return null
  return Math.round((score.correct / score.answered) * 100)
}

function rateFrom(correct, answered) {
  return answered ? Math.round((correct / answered) * 100) : null
}

function percentCell(correct, answered) {
  if (!answered) return '—'
  return `${Math.round((correct / answered) * 100)}%`
}

function addScore(store, key, right) {
  const score = store.get(key) || { correct: 0, answered: 0 }
  score.answered += 1
  if (right) score.correct += 1
  store.set(key, score)
}

function answeredOf(store, key) {
  return store.get(key)?.answered || 0
}

function groupLabels(row) {
  return BANDS.filter((band) => row[band.id]).map((band) => band.label)
}

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value || '')
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function questionMap(value) {
  const list = parseJson(value, [])
  const map = new Map()
  if (!Array.isArray(list)) return map
  for (const question of list) {
    if (question && typeof question.id === 'string') map.set(question.id, question)
  }
  return map
}

function parseQuizQuestions(value) {
  const parsed = parseJson(value, [])
  const list = Array.isArray(parsed) ? parsed : []
  const byId = new Map(list.filter((item) => item?.id).map((item) => [item.id, item]))
  return { count: list.length, byId }
}

function mistakeBucket(store, key, seed) {
  if (!store.has(key)) store.set(key, { ...seed, wrong: 0, correct: 0 })
  return store.get(key)
}

async function lessonScores(userIds) {
  const scores = new Map()
  if (!userIds.length) return scores
  const attempts = await statsRepo.listLessonAttemptsByUsers(userIds)
  if (!attempts.length) return scores
  const lessonIds = [...new Set(attempts.map((row) => row.lesson_id))]
  const lessons = await statsRepo.listLessonsByIds(lessonIds)
  const packs = new Map(lessons.map((row) => [row.id, { ru: questionMap(row.questions), kk: questionMap(row.questions_kk) }]))
  for (const attempt of attempts) {
    const pack = packs.get(attempt.lesson_id)
    if (!pack) continue
    const score = scores.get(attempt.user_id) || { correct: 0, answered: 0 }
    score.attempts = (score.attempts || 0) + 1
    if (!score.lastAt || String(attempt.finished_at) > String(score.lastAt)) score.lastAt = attempt.finished_at
    scores.set(attempt.user_id, score)
    const questions = attempt.lang === 'kk' && pack.kk.size ? pack.kk : pack.ru
    const given = parseJson(attempt.answers, [])
    if (!Array.isArray(given)) continue
    for (const answer of given) {
      const question = questions.get(answer?.questionId)
      if (!question) continue
      const chosen = Number(answer.chosen)
      if (!Number.isInteger(chosen) || chosen < 0) continue
      addScore(scores, attempt.user_id, chosen === question.correctIndex)
    }
  }
  return scores
}

function countedQuizAnswers(byId, player) {
  let correct = 0
  let answered = 0
  for (const answer of player?.answers || []) {
    const known = byId.get(answer.questionId)
    const text = answer.question || known?.text || ''
    if (!text) continue
    const chosen = answer.chosen
    if (chosen == null || String(chosen) === '') continue
    answered += 1
    if (answer.ok) correct += 1
  }
  return { correct, answered }
}

function tallyQuiz(row, parsedQuestions, runs, access, mistakes, orgScores) {
  const { count: questionCount, byId } = parsedQuestions
  const players = []
  let correct = 0
  let answeredTotal = 0
  const kind = access === 'private' ? 'Приватный' : 'Публичный'
  for (const result of runs) {
    const seated = parseJson(result.players, [])
    if (!Array.isArray(seated)) continue
    for (const player of seated) {
      players.push(player)
      for (const answer of player.answers || []) {
        const known = byId.get(answer.questionId)
        const text = answer.question || known?.text || ''
        if (!text) continue
        const chosen = answer.chosen
        const answered = chosen != null && String(chosen) !== ''
        if (!answered) continue
        answeredTotal += 1
        const right = Boolean(answer.ok)
        if (right) correct += 1
        if (access === 'private' && result.organization_id) {
          const score = orgScores.get(result.organization_id) || { correct: 0, answered: 0 }
          score.answered += 1
          if (right) score.correct += 1
          orgScores.set(result.organization_id, score)
          continue
        }
        const bucket = mistakeBucket(mistakes, `quiz:${row.id}:${access}:${answer.questionId || text}`, {
          text,
          textKk: '',
          source: row.title,
          sourceKk: '',
          kind,
        })
        if (right) bucket.correct += 1
        else bucket.wrong += 1
      }
    }
  }
  return {
    id: row.id,
    title: row.title,
    questionCount,
    runs: runs.length,
    participants: players.length,
    correct,
    answered: answeredTotal,
    rate: rateFrom(correct, answeredTotal),
  }
}

async function regionCatalog() {
  const [regions, districtCounts, orgCounts, learnerRows] = await Promise.all([
    statsRepo.listRegionStatsBase(),
    statsRepo.countDistrictsByRegion(),
    statsRepo.countOrganizationsByRegion(),
    statsRepo.listAllLearnerRegions(),
  ])
  const learnerCountsMap = new Map()
  for (const row of learnerRows) learnerCountsMap.set(row.region_id, (learnerCountsMap.get(row.region_id) || 0) + 1)
  const byUser = await lessonScores(learnerRows.map((row) => row.id))
  const scores = new Map()
  const totals = { regions: regions.length, organizations: 0, learners: learnerRows.length, activeLearners: 0, attempts: 0, correct: 0, answered: 0 }
  for (const value of orgCounts.values()) totals.organizations += value
  for (const row of learnerRows) {
    const score = byUser.get(row.id)
    if (!score) continue
    const current = scores.get(row.region_id) || { correct: 0, answered: 0, attempts: 0, active: 0 }
    current.correct += score.correct
    current.answered += score.answered
    current.attempts += score.attempts || 0
    current.active += 1
    scores.set(row.region_id, current)
    totals.activeLearners += 1
    totals.attempts += score.attempts || 0
    totals.correct += score.correct
    totals.answered += score.answered
  }
  totals.rate = rateFrom(totals.correct, totals.answered)
  return {
    scope: 'platform',
    totals,
    regions: regions
      .map((row) => ({
        id: row.id,
        name: row.name,
        nameKk: row.name_kk || '',
        districts: districtCounts.get(row.id) || 0,
        organizations: orgCounts.get(row.id) || 0,
        learners: learnerCountsMap.get(row.id) || 0,
        activeLearners: scores.get(row.id)?.active || 0,
        attempts: scores.get(row.id)?.attempts || 0,
        correct: scores.get(row.id)?.correct || 0,
        answered: answeredOf(scores, row.id),
        rate: rateOf(scores.get(row.id)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
  }
}

export async function platformStats(actor, requestedRegionId = null) {
  assertRole(actor, 'super', 'regional')
  if (actor.role !== 'regional' && !requestedRegionId) return regionCatalog()
  const regionId = actor.role === 'regional' ? actor.regionId : requestedRegionId
  if (!regionId) fail('Недостаточно прав', 403)
  const region = await mustRegion(regionId)
  const [districtRows, orgRows, lessonRows, roster, attemptRows, quizRows, resultRows] = await Promise.all([
    statsRepo.listRegionDistricts(regionId),
    statsRepo.listRegionOrganizations(regionId),
    statsRepo.listAllLessons(),
    statsRepo.listRegionLearners(regionId),
    statsRepo.listRegionLessonAttempts(regionId),
    statsRepo.listPlatformQuizzes(),
    statsRepo.listRegionQuizResults(regionId),
  ])

  const regionUserIds = new Set(roster.map((row) => row.id))
  const peopleById = new Map(roster.map((row) => [row.id, { name: row.display_name, orgId: row.organization_id, band: row.band || '' }]))
  const learnersByName = new Map()
  const learnerDistrict = new Map()
  for (const row of roster) {
    if (row.district_id) learnerDistrict.set(row.id, row.district_id)
    const key = `${row.organization_id}\n${String(row.display_name || '').trim().toLowerCase()}`
    const list = learnersByName.get(key) || []
    if (row.band) list.push(row.band)
    learnersByName.set(key, list)
  }

  const attemptsByLesson = new Map()
  for (const row of attemptRows) {
    const list = attemptsByLesson.get(row.lesson_id) || []
    list.push(row)
    attemptsByLesson.set(row.lesson_id, list)
  }

  const resultsByQuiz = new Map()
  for (const row of resultRows) {
    const key = row.quiz_id || row.quiz_title
    const list = resultsByQuiz.get(key) || []
    list.push(row)
    resultsByQuiz.set(key, list)
  }

  const districts = districtRows.map((row) => ({
    id: row.id,
    name: row.name,
    nameKk: row.name_kk || '',
    region: row.region_name,
    regionKk: row.region_name_kk || '',
    organizations: Number(row.organizations),
    learners: Number(row.learners),
  }))
  const organizations = orgRows.map((row) => ({
    id: row.id,
    name: row.name,
    nameKk: row.name_kk || '',
    districtId: row.district_id || '',
    district: row.district_name || '',
    districtKk: row.district_name_kk || '',
    region: row.region_name,
    regionKk: row.region_name_kk || '',
    classes: Number(row.classes),
    learners: Number(row.learners),
  }))

  const lessonOrg = new Map()
  const districtScores = new Map()
  const mistakes = new Map()
  const activeLearners = new Set()
  const activeOrgs = new Set()
  const totals = { attempts: 0, correct: 0, answered: 0, quizRuns: 0, quizParticipants: 0, quizCorrect: 0, quizAnswered: 0 }

  function lessonSlot(lessonId, userId) {
    const person = peopleById.get(userId)
    if (!person) return null
    let byOrg = lessonOrg.get(lessonId)
    if (!byOrg) {
      byOrg = new Map()
      lessonOrg.set(lessonId, byOrg)
    }
    let bucket = byOrg.get(person.orgId)
    if (!bucket) {
      bucket = { attempts: 0, users: new Map() }
      byOrg.set(person.orgId, bucket)
    }
    let user = bucket.users.get(userId)
    if (!user) {
      user = { id: userId, name: person.name, attempts: 0, correct: 0, answered: 0 }
      bucket.users.set(userId, user)
    }
    return { bucket, user }
  }

  const lessons = lessonRows.map((row) => {
    const ru = questionMap(row.questions)
    const kk = questionMap(row.questions_kk)
    const attempts = attemptsByLesson.get(row.id) || []
    const learners = new Set()
    let taken = 0
    let correct = 0
    let answeredTotal = 0
    for (const attempt of attempts) {
      if (!regionUserIds.has(attempt.user_id)) continue
      taken += 1
      learners.add(attempt.user_id)
      activeLearners.add(attempt.user_id)
      const slot = lessonSlot(row.id, attempt.user_id)
      if (slot) {
        slot.bucket.attempts += 1
        slot.user.attempts += 1
        activeOrgs.add(peopleById.get(attempt.user_id)?.orgId)
      }
      const pack = attempt.lang === 'kk' && kk.size ? kk : ru
      const given = parseJson(attempt.answers, [])
      if (!Array.isArray(given)) continue
      for (const answer of given) {
        const question = pack.get(answer?.questionId)
        if (!question) continue
        const chosen = Number(answer.chosen)
        const answered = Number.isInteger(chosen) && chosen >= 0
        if (!answered) continue
        answeredTotal += 1
        if (slot) slot.user.answered += 1
        const right = chosen === question.correctIndex
        if (right) {
          correct += 1
          if (slot) slot.user.correct += 1
        }
        const districtId = learnerDistrict.get(attempt.user_id)
        if (districtId) {
          const score = districtScores.get(districtId) || { correct: 0, answered: 0 }
          score.answered += 1
          if (right) score.correct += 1
          districtScores.set(districtId, score)
        }
        const bucket = mistakeBucket(mistakes, `lesson:${row.id}:${question.id}`, {
          text: ru.get(question.id)?.text || question.text || '',
          textKk: kk.get(question.id)?.text || '',
          source: row.title,
          sourceKk: row.title_kk || '',
          kind: 'Урок',
        })
        if (right) bucket.correct += 1
        else bucket.wrong += 1
      }
    }
    totals.attempts += taken
    totals.correct += correct
    totals.answered += answeredTotal
    return {
      id: row.id,
      title: row.title,
      titleKk: row.title_kk || '',
      format: row.format === 'video' ? 'Видео' : 'Презентация',
      groups: groupLabels(row),
      bands: BANDS.filter((band) => row[band.id]).map((band) => band.id),
      attempts: taken,
      learners: learners.size,
      correct,
      answered: answeredTotal,
      rate: rateFrom(correct, answeredTotal),
    }
  })

  for (const district of districts) {
    const score = districtScores.get(district.id) || { correct: 0, answered: 0 }
    district.correct = score.correct
    district.answered = score.answered
    district.rate = rateFrom(score.correct, score.answered)
  }

  const publicQuizzes = []
  const orgScores = new Map()
  const quizPrivate = new Map()
  const quizPublic = new Map()
  const knownQuizIds = new Set(quizRows.map((row) => row.id))
  const allQuizRows = [...quizRows]
  for (const [quizId, runs] of resultsByQuiz) {
    if (knownQuizIds.has(quizId)) continue
    const sample = runs[0]
    allQuizRows.push({
      id: quizId,
      title: sample?.quiz_title || 'Удалённый квиз',
      questions: '[]',
      deleted: true,
    })
  }
  for (const row of allQuizRows) {
    const parsedQuestions = parseQuizQuestions(row.questions)
    const runs = resultsByQuiz.get(row.id) || []
    const publicRuns = runs.filter((item) => item.access !== 'private')
    const privateRuns = runs.filter((item) => item.access === 'private')
    if (!row.deleted) {
      publicQuizzes.push(tallyQuiz(row, parsedQuestions, publicRuns, 'public', mistakes, orgScores))
      notePublicQuiz(parsedQuestions.byId, row, publicRuns, quizPublic)
    }
    const privateTally = tallyQuiz(row, parsedQuestions, privateRuns, 'private', mistakes, orgScores)
    totals.quizRuns += privateTally.runs
    totals.quizParticipants += privateTally.participants
    totals.quizCorrect += privateTally.correct
    totals.quizAnswered += privateTally.answered
    for (const result of privateRuns) if (result.organization_id) activeOrgs.add(result.organization_id)
    for (const result of privateRuns) notePrivateQuiz(parsedQuestions.byId, row, result, quizPrivate, peopleById, learnersByName)
  }

  for (const [lessonId, byOrg] of lessonOrg) {
    if (!lessonId) continue
    for (const [orgId, bucket] of byOrg) {
      const score = orgScores.get(orgId) || { correct: 0, answered: 0 }
      for (const user of bucket.users.values()) {
        score.correct += user.correct
        score.answered += user.answered
      }
      orgScores.set(orgId, score)
    }
  }

  const orgAttempts = new Map()
  const orgActive = new Map()
  for (const byOrg of lessonOrg.values()) {
    for (const [orgId, bucket] of byOrg) {
      orgAttempts.set(orgId, (orgAttempts.get(orgId) || 0) + bucket.attempts)
      const active = orgActive.get(orgId) || new Set()
      for (const userId of bucket.users.keys()) active.add(userId)
      orgActive.set(orgId, active)
    }
  }

  for (const org of organizations) {
    const score = orgScores.get(org.id) || { correct: 0, answered: 0 }
    org.correct = score.correct
    org.answered = score.answered
    org.rate = rateFrom(score.correct, score.answered)
    org.attempts = orgAttempts.get(org.id) || 0
    org.activeLearners = orgActive.get(org.id)?.size || 0
    org.active = activeOrgs.has(org.id)
  }
  activeOrgs.delete(undefined)

  const lessonBands = buildLessonBands(lessonRows, districts, organizations, lessonOrg)
  const quizBands = buildQuizBands(allQuizRows, districts, organizations, quizPrivate, quizPublic)
  const learnerTotal = organizations.reduce((sum, org) => sum + org.learners, 0)

  return {
    scope: 'region',
    regionId,
    title: region.name,
    titleKk: region.nameKk,
    cards: [
      { label: 'Районов', value: districts.length },
      { label: 'Организаций', value: organizations.length },
      { label: 'Уроков', value: lessons.length },
      { label: 'Квизов', value: quizRows.length },
    ],
    totals: {
      ...totals,
      learners: learnerTotal,
      activeLearners: activeLearners.size,
      activeOrganizations: activeOrgs.size,
      rate: rateFrom(totals.correct, totals.answered),
      quizRate: rateFrom(totals.quizCorrect, totals.quizAnswered),
    },
    districts,
    organizations,
    lessons,
    lessonBands,
    quizBands,
    publicQuizzes,
    mistakes: [...mistakes.values()]
      .filter((item) => item.wrong > 0)
      .sort((a, b) => b.wrong - a.wrong || b.correct - a.correct || a.text.localeCompare(b.text, 'ru')),
  }
}

export async function orgStats(actor, requestedOrgId = null) {
  assertRole(actor, 'org', 'regional', 'super')
  const organizationId = actor.role === 'org' ? actor.organizationId : requestedOrgId
  if (!organizationId) fail('Организация не найдена', 404)
  const org = actor.role === 'regional'
    ? await orgInRegion(organizationId, actor.regionId)
    : await mustOrg(organizationId)
  const [region, classRows, learnerRows, attemptRows, lessonRows, resultRows] = await Promise.all([
    mustRegion(org.regionId),
    classesRepo.listClassesWithLearners([org.id]),
    statsRepo.listOrgLearners(org.id),
    statsRepo.listOrgLessonAttempts(org.id),
    statsRepo.listAllLessons(),
    statsRepo.listOrgPrivateResults(org.id),
  ])
  const quizIds = [...new Set(resultRows.map((row) => row.quiz_id).filter(Boolean))]
  const quizRows = await statsRepo.listQuizzesByIds(quizIds)

  const classById = new Map(classRows.map((item) => [item.id, item]))
  const people = new Map(learnerRows.map((row) => [row.id, {
    id: row.id,
    name: row.display_name || '',
    login: row.login,
    classId: row.class_id || '',
    classCaption: classCaption(classById.get(row.class_id)) || '',
    band: classById.get(row.class_id)?.band || '',
    attempts: 0,
    correct: 0,
    answered: 0,
    lastAt: null,
  }]))

  const attemptsByLesson = new Map()
  for (const row of attemptRows) {
    const list = attemptsByLesson.get(row.lesson_id) || []
    list.push(row)
    attemptsByLesson.set(row.lesson_id, list)
  }

  const mistakes = new Map()
  const totals = { attempts: 0, correct: 0, answered: 0, quizRuns: 0, quizParticipants: 0, quizCorrect: 0, quizAnswered: 0 }
  const lessons = []
  for (const row of lessonRows) {
    const assigned = BANDS.some((band) => org.groups[band.id] && row[band.id])
    const attempts = (attemptsByLesson.get(row.id) || []).filter((attempt) => people.has(attempt.user_id))
    if (!assigned && !attempts.length) continue
    const ru = questionMap(row.questions)
    const kk = questionMap(row.questions_kk)
    const learners = new Set()
    let correct = 0
    let answered = 0
    for (const attempt of attempts) {
      const person = people.get(attempt.user_id)
      learners.add(attempt.user_id)
      person.attempts += 1
      if (!person.lastAt || String(attempt.finished_at) > String(person.lastAt)) person.lastAt = attempt.finished_at
      const pack = attempt.lang === 'kk' && kk.size ? kk : ru
      const given = parseJson(attempt.answers, [])
      if (!Array.isArray(given)) continue
      for (const answer of given) {
        const question = pack.get(answer?.questionId)
        if (!question) continue
        const chosen = Number(answer.chosen)
        if (!Number.isInteger(chosen) || chosen < 0) continue
        const right = chosen === question.correctIndex
        answered += 1
        person.answered += 1
        if (right) {
          correct += 1
          person.correct += 1
        }
        const bucket = mistakeBucket(mistakes, `lesson:${row.id}:${question.id}`, {
          text: ru.get(question.id)?.text || question.text || '',
          textKk: kk.get(question.id)?.text || '',
          source: row.title,
          sourceKk: row.title_kk || '',
          kind: 'Урок',
        })
        if (right) bucket.correct += 1
        else bucket.wrong += 1
      }
    }
    totals.attempts += attempts.length
    totals.correct += correct
    totals.answered += answered
    lessons.push({
      id: row.id,
      title: row.title,
      titleKk: row.title_kk || '',
      format: row.format === 'video' ? 'Видео' : 'Презентация',
      groups: groupLabels(row),
      bands: BANDS.filter((band) => row[band.id]).map((band) => band.id),
      attempts: attempts.length,
      learners: learners.size,
      correct,
      answered,
      rate: rateFrom(correct, answered),
    })
  }

  const quizById = new Map(quizRows.map((row) => [row.id, { row, parsed: parseQuizQuestions(row.questions) }]))
  const emptyParsed = { count: 0, byId: new Map() }
  const quizStats = new Map()
  for (const result of resultRows) {
    const entry = quizById.get(result.quiz_id)
    const row = entry?.row || { id: result.quiz_id || result.quiz_title, title: result.quiz_title }
    const byId = entry?.parsed.byId || emptyParsed.byId
    let stat = quizStats.get(row.id)
    if (!stat) {
      stat = { id: row.id, title: row.title, runs: 0, participants: 0, correct: 0, answered: 0, lastAt: null }
      quizStats.set(row.id, stat)
    }
    stat.runs += 1
    const when = result.finished_at || result.started_at
    if (when && (!stat.lastAt || String(when) > String(stat.lastAt))) stat.lastAt = when
    const seated = parseJson(result.players, [])
    if (!Array.isArray(seated)) continue
    for (const player of seated) {
      stat.participants += 1
      const counts = countedQuizAnswers(byId, player)
      stat.correct += counts.correct
      stat.answered += counts.answered
      for (const answer of player.answers || []) {
        const text = answer.question || byId.get(answer.questionId)?.text || ''
        if (!text) continue
        if (answer.chosen == null || String(answer.chosen) === '') continue
        const bucket = mistakeBucket(mistakes, `quiz:${row.id}:${answer.questionId || text}`, {
          text,
          textKk: '',
          source: row.title,
          sourceKk: '',
          kind: 'Квиз',
        })
        if (answer.ok) bucket.correct += 1
        else bucket.wrong += 1
      }
    }
  }
  const quizzes = [...quizStats.values()].map((stat) => ({ ...stat, rate: rateFrom(stat.correct, stat.answered) }))
  for (const quiz of quizzes) {
    totals.quizRuns += quiz.runs
    totals.quizParticipants += quiz.participants
    totals.quizCorrect += quiz.correct
    totals.quizAnswered += quiz.answered
  }

  const learners = [...people.values()]
    .map((person) => ({ ...person, rate: rateFrom(person.correct, person.answered) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  const classes = classRows
    .map((item) => {
      const members = learners.filter((person) => person.classId === item.id)
      const correct = members.reduce((sum, person) => sum + person.correct, 0)
      const answered = members.reduce((sum, person) => sum + person.answered, 0)
      return {
        id: item.id,
        name: item.name,
        caption: classCaption(item),
        band: item.band,
        grade: item.grade,
        trackName: item.trackName || '',
        learners: item.learners,
        active: members.filter((person) => person.attempts > 0).length,
        attempts: members.reduce((sum, person) => sum + person.attempts, 0),
        correct,
        answered,
        rate: rateFrom(correct, answered),
      }
    })
    .sort((a, b) => a.caption.localeCompare(b.caption, 'ru'))

  return {
    scope: 'organization',
    organizationId: org.id,
    regionId: org.regionId,
    title: org.name,
    titleKk: org.nameKk,
    region: region.name,
    regionKk: region.nameKk,
    district: org.districtName,
    districtKk: org.districtNameKk,
    groups: org.groups,
    totals: {
      ...totals,
      classes: classes.length,
      learners: learners.length,
      activeLearners: learners.filter((person) => person.attempts > 0).length,
      lessons: lessons.length,
      quizzes: quizzes.length,
      rate: rateFrom(totals.correct, totals.answered),
      quizRate: rateFrom(totals.quizCorrect, totals.quizAnswered),
    },
    classes,
    learners,
    lessons,
    quizzes,
    mistakes: [...mistakes.values()]
      .filter((item) => item.wrong > 0)
      .sort((a, b) => b.wrong - a.wrong || b.correct - a.correct || a.text.localeCompare(b.text, 'ru')),
  }
}

function sumAt(nodes, index) {
  return nodes.reduce((sum, node) => sum + Number(node.summary[index] || 0), 0)
}

function totalOf(nodes, field) {
  return nodes.reduce((sum, node) => sum + (node[field] || 0), 0)
}

function lessonTotals(nodes) {
  return {
    attempts: totalOf(nodes, 'attempts'),
    learners: totalOf(nodes, 'learners'),
    correct: totalOf(nodes, 'correct'),
    answered: totalOf(nodes, 'answered'),
  }
}

function orgLessonFold(lessonId, org, lessonOrg) {
  const stat = lessonOrg.get(lessonId)?.get(org.id)
  const users = stat ? [...stat.users.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru')) : []
  const correct = users.reduce((sum, user) => sum + user.correct, 0)
  const answered = users.reduce((sum, user) => sum + user.answered, 0)
  return {
    key: org.id,
    kind: 'organization',
    name: org.name,
    nameKk: org.nameKk,
    attempts: stat?.attempts || 0,
    learners: users.length,
    correct,
    answered,
    summary: [{ ru: org.name, kk: org.nameKk }, stat?.attempts || 0, users.length, correct],
    empty: 'нет тестируемых',
    people: users.map((user) => ({ id: user.id, name: user.name, attempts: user.attempts, correct: user.correct, answered: user.answered })),
  }
}

function districtLessonFolds(lessonId, districts, organizations, lessonOrg) {
  const known = new Set(districts.map((district) => district.id))
  const folds = districts.map((district) => {
    const groups = organizations
      .filter((org) => org.districtId === district.id)
      .map((org) => orgLessonFold(lessonId, org, lessonOrg))
    return {
      key: district.id,
      kind: 'district',
      name: district.name,
      nameKk: district.nameKk,
      ...lessonTotals(groups),
      summary: [{ ru: district.name, kk: district.nameKk }, sumAt(groups, 1), sumAt(groups, 2), sumAt(groups, 3)],
      groupColumns: ['Организация', 'Попытки', 'Тестируемые', 'Верных ответов'],
      empty: 'Нет организаций',
      groups,
    }
  })
  const loose = organizations.filter((org) => !org.districtId || !known.has(org.districtId))
  if (loose.length) {
    const groups = loose.map((org) => orgLessonFold(lessonId, org, lessonOrg))
    folds.push({
      key: 'none',
      kind: 'district',
      name: '—',
      nameKk: '',
      ...lessonTotals(groups),
      summary: ['—', sumAt(groups, 1), sumAt(groups, 2), sumAt(groups, 3)],
      groupColumns: ['Организация', 'Попытки', 'Тестируемые', 'Верных ответов'],
      empty: 'Нет организаций',
      groups,
    })
  }
  return folds
}

function buildLessonBands(lessonRows, districts, organizations, lessonOrg) {
  return BANDS.map((band) => {
    const groups = lessonRows.filter((row) => row[band.id]).map((row) => {
      const places = districtLessonFolds(row.id, districts, organizations, lessonOrg)
      return {
        key: row.id,
        kind: 'lesson',
        name: row.title,
        nameKk: row.title_kk || '',
        ...lessonTotals(places),
        summary: [{ ru: row.title, kk: row.title_kk || '' }, sumAt(places, 1), sumAt(places, 2), sumAt(places, 3)],
        groupColumns: ['Район', 'Попытки', 'Тестируемые', 'Верных ответов'],
        empty: 'Нет районов',
        groups: places,
      }
    })
    return {
      key: band.id,
      kind: 'band',
      name: band.label,
      nameKk: '',
      ...lessonTotals(groups),
      summary: [band.label, groups.length, sumAt(groups, 1), sumAt(groups, 3)],
      groupColumns: ['Урок', 'Попытки', 'Тестируемые', 'Верных ответов'],
      empty: 'Нет уроков',
      groups,
    }
  })
}

function quizPlayerSlot(bucket, name) {
  const label = String(name || '').trim() || '—'
  const key = label.toLowerCase()
  let user = bucket.users.get(key)
  if (!user) {
    user = { name: label, runs: 0, correct: 0, answered: 0 }
    bucket.users.set(key, user)
  }
  return user
}

function notePublicQuiz(byId, row, runs, quizPublic) {
  const stat = { runs: runs.length, users: new Map() }
  for (const result of runs) {
    const seated = parseJson(result.players, [])
    if (!Array.isArray(seated)) continue
    for (const player of seated) {
      const user = quizPlayerSlot(stat, player.name)
      const counts = countedQuizAnswers(byId, player)
      user.runs += 1
      user.correct += counts.correct
      user.answered += counts.answered
    }
  }
  quizPublic.set(row.id, stat)
}

function bandForQuizPlayer(result, player, peopleById, learnersByName) {
  if (BANDS.some((band) => band.id === result.band)) return result.band
  const person = player?.userId ? peopleById.get(player.userId) : null
  if (person?.band) return person.band
  const key = `${result.organization_id}\n${String(player?.name || '').trim().toLowerCase()}`
  const known = [...new Set(learnersByName.get(key) || [])]
  if (known.length === 1) return known[0]
  return 'unplaced'
}

function privateQuizBucket(quizPrivate, quizId, bandId, orgId) {
  let byBand = quizPrivate.get(quizId)
  if (!byBand) {
    byBand = new Map()
    quizPrivate.set(quizId, byBand)
  }
  let byOrg = byBand.get(bandId)
  if (!byOrg) {
    byOrg = new Map()
    byBand.set(bandId, byOrg)
  }
  let bucket = byOrg.get(orgId)
  if (!bucket) {
    bucket = { runs: 0, users: new Map() }
    byOrg.set(orgId, bucket)
  }
  return bucket
}

function notePrivateQuiz(byId, row, result, quizPrivate, peopleById, learnersByName) {
  const seated = parseJson(result.players, [])
  const players = Array.isArray(seated) ? seated : []
  const orgId = result.organization_id
  if (!players.length) {
    privateQuizBucket(quizPrivate, row.id, result.band || 'unplaced', orgId).runs += 1
    return
  }
  const seen = new Set()
  for (const player of players) {
    const band = bandForQuizPlayer(result, player, peopleById, learnersByName)
    const bucket = privateQuizBucket(quizPrivate, row.id, band, orgId)
    const mark = `${band}\n${orgId}`
    if (!seen.has(mark)) {
      seen.add(mark)
      bucket.runs += 1
    }
    const user = quizPlayerSlot(bucket, player.name)
    const counts = countedQuizAnswers(byId, player)
    user.runs += 1
    user.correct += counts.correct
    user.answered += counts.answered
  }
}

function quizTotals(nodes) {
  return {
    runs: totalOf(nodes, 'runs'),
    participants: totalOf(nodes, 'participants'),
    correct: totalOf(nodes, 'correct'),
    answered: totalOf(nodes, 'answered'),
  }
}

function quizPeopleFold(stat, title) {
  const users = stat ? [...stat.users.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru')) : []
  const correct = users.reduce((sum, user) => sum + user.correct, 0)
  const answered = users.reduce((sum, user) => sum + user.answered, 0)
  const label = title.label
  return {
    key: title.key,
    kind: title.kind,
    name: typeof label === 'object' ? label.ru : label,
    nameKk: typeof label === 'object' ? label.kk || '' : '',
    runs: stat?.runs || 0,
    participants: users.length,
    correct,
    answered,
    summary: [title.label, stat?.runs || 0, users.length, correct, percentCell(correct, answered)],
    empty: 'нет участников',
    people: users.map((user) => ({ name: user.name, runs: user.runs, correct: user.correct, answered: user.answered })),
  }
}

function quizDistrictFolds(byOrg, districts, organizations) {
  const known = new Set(districts.map((district) => district.id))
  const folds = districts.map((district) => {
    const groups = organizations
      .filter((org) => org.districtId === district.id)
      .map((org) => quizPeopleFold(byOrg.get(org.id), { key: org.id, kind: 'organization', label: { ru: org.name, kk: org.nameKk } }))
    const sums = quizTotals(groups)
    return {
      key: district.id,
      kind: 'district',
      name: district.name,
      nameKk: district.nameKk,
      ...sums,
      summary: [{ ru: district.name, kk: district.nameKk }, sumAt(groups, 1), sumAt(groups, 2), sums.correct, percentCell(sums.correct, sums.answered)],
      groupColumns: ['Организация', 'Запуски', 'Участники', 'Верных ответов', '%'],
      empty: 'Нет организаций',
      groups,
    }
  })
  const loose = organizations.filter((org) => !org.districtId || !known.has(org.districtId))
  if (loose.length) {
    const groups = loose.map((org) => quizPeopleFold(byOrg.get(org.id), { key: org.id, kind: 'organization', label: { ru: org.name, kk: org.nameKk } }))
    const sums = quizTotals(groups)
    folds.push({
      key: 'none',
      kind: 'district',
      name: '—',
      nameKk: '',
      ...sums,
      summary: ['—', sumAt(groups, 1), sumAt(groups, 2), sums.correct, percentCell(sums.correct, sums.answered)],
      groupColumns: ['Организация', 'Запуски', 'Участники', 'Верных ответов', '%'],
      empty: 'Нет организаций',
      groups,
    })
  }
  return folds
}

function quizBandNode(key, name, groups, columns) {
  const sums = quizTotals(groups)
  return {
    key,
    kind: 'band',
    name,
    nameKk: '',
    ...sums,
    summary: [name, groups.length, sumAt(groups, 1), sums.correct, percentCell(sums.correct, sums.answered)],
    groupColumns: columns,
    empty: 'Нет квизов',
    groups,
  }
}

function quizPlacesNode(row, places) {
  const sums = quizTotals(places)
  return {
    key: row.id,
    kind: 'quiz',
    name: row.title,
    nameKk: '',
    ...sums,
    summary: [row.title, sumAt(places, 1), sumAt(places, 2), sums.correct, percentCell(sums.correct, sums.answered)],
    groupColumns: ['Район', 'Запуски', 'Участники', 'Верных ответов', '%'],
    empty: 'Нет районов',
    groups: places,
  }
}

function buildQuizBands(quizRows, districts, organizations, quizPrivate, quizPublic) {
  const columns = ['Квиз', 'Запуски', 'Участники', 'Верных ответов', '%']
  const publicGroups = quizRows
    .filter((row) => !row.deleted)
    .map((row) => quizPeopleFold(quizPublic.get(row.id), { key: row.id, kind: 'quiz', label: row.title }))
  const bands = BANDS.map((band) => {
    const groups = quizRows
      .filter((row) => quizPrivate.get(row.id)?.has(band.id))
      .map((row) => quizPlacesNode(row, quizDistrictFolds(quizPrivate.get(row.id).get(band.id), districts, organizations)))
    return quizBandNode(band.id, band.label, groups, columns)
  })
  const unplaced = quizRows
    .filter((row) => quizPrivate.get(row.id)?.has('unplaced'))
    .map((row) => quizPlacesNode(row, quizDistrictFolds(quizPrivate.get(row.id).get('unplaced'), districts, organizations)))
  if (unplaced.length) bands.push(quizBandNode('unplaced', 'Без группы', unplaced, columns))
  return [quizBandNode('public', 'Публичные', publicGroups, columns), ...bands]
}
