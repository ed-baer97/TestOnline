import { db } from './db.js'
import { BANDS, GROUP_KEYS, assertRole, fail } from './domain.js'
import { classCaption, count, learnerCounts, listRegions, mapOrg, mustOrg, mustRegion } from './admin.js'

function rateOf(score) {
  if (!score?.answered) return null
  return Math.round((score.correct / score.answered) * 100)
}

function rateFrom(correct, answered) {
  return answered ? Math.round((correct / answered) * 100) : null
}

function rateCell(rate) {
  return rate == null ? '—' : `${rate}%`
}

function percentCell(correct, answered) {
  if (!answered) return '—'
  return `${Math.round((correct / answered) * 100)}%`
}

function percentItem(key, label, labelKk, rate, answered = null) {
  const item = { key, label, labelKk, value: rate ?? 0, text: rate == null ? '—' : `${rate}%`, empty: rate == null }
  if (answered != null) item.answered = answered
  return item
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

function mistakeBucket(store, key, seed) {
  if (!store.has(key)) store.set(key, { ...seed, wrong: 0, correct: 0 })
  return store.get(key)
}

function classDetail(items, classRate) {
  return {
    columns: ['Класс', 'Тестируемые', 'Верных ответов'],
    rows: items.map((item) => ({
      key: item.id,
      cells: [classCaption(item), item.learners, rateCell(classRate(item.id))],
    })),
  }
}

async function lessonScores(userIds) {
  const scores = new Map()
  if (!userIds.length) return scores
  const marks = userIds.map(() => '?').join(',')
  const attempts = await db.all(
    `SELECT lesson_id, user_id, lang, answers, finished_at FROM lesson_attempts WHERE user_id IN (${marks})`,
    ...userIds,
  )
  if (!attempts.length) return scores
  const lessonIds = [...new Set(attempts.map((row) => row.lesson_id))]
  const lessonMarks = lessonIds.map(() => '?').join(',')
  const lessons = await db.all(
    `SELECT id, questions, questions_kk FROM lessons WHERE id IN (${lessonMarks})`,
    ...lessonIds,
  )
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

async function privateScores(orgIds) {
  const scores = new Map()
  if (!orgIds.length) return scores
  const marks = orgIds.map(() => '?').join(',')
  const rows = await db.all(
    `SELECT organization_id, players FROM results WHERE access = 'private' AND organization_id IN (${marks})`,
    ...orgIds,
  )
  for (const row of rows) {
    const seated = parseJson(row.players, [])
    if (!Array.isArray(seated)) continue
    for (const player of seated) {
      for (const answer of player.answers || []) {
        const chosen = answer.chosen
        if (chosen == null || String(chosen) === '') continue
        addScore(scores, row.organization_id, Boolean(answer.ok))
      }
    }
  }
  return scores
}

function chart(caption, items, order = 'value') {
  const list = items.filter((item) => item.label)
  if (order === 'given') return { caption, items: list }
  return {
    caption,
    items: list.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'ru')),
  }
}

async function composition(orgIds) {
  if (!orgIds.length) return []
  const marks = orgIds.map(() => '?').join(',')
  const rows = await db.all(
    `SELECT c.id, c.name, c.band, c.grade, c.organization_id, t.name AS track_name,
            (SELECT COUNT(*) FROM users u WHERE u.role = 'learner' AND u.class_id = c.id) AS learners
     FROM classes c
     LEFT JOIN tracks t ON t.id = c.track_id
     WHERE c.organization_id IN (${marks})`,
    ...orgIds,
  )
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    band: row.band,
    grade: row.grade == null ? null : Number(row.grade),
    organizationId: row.organization_id,
    trackName: row.track_name,
    learners: Number(row.learners),
  }))
}

function bandItems(classes, orgs) {
  const enabled = new Set()
  for (const org of orgs) {
    for (const key of GROUP_KEYS) if (org.groups[key]) enabled.add(key)
  }
  const totals = new Map(BANDS.map((band) => [band.id, 0]))
  for (const item of classes) totals.set(item.band, (totals.get(item.band) || 0) + item.learners)
  return BANDS.filter((band) => enabled.has(band.id) || totals.get(band.id) > 0).map((band) => ({
    key: band.id,
    label: band.label,
    value: totals.get(band.id) || 0,
  }))
}

function gradeItems(classes) {
  const buckets = new Map()
  for (const item of classes) {
    const students = item.band === 'students'
    const key = students ? `track:${item.trackName}` : `grade:${item.grade}`
    const label = students ? (item.trackName || 'Студенты') : `${item.grade} класс`
    const current = buckets.get(key) || { key, label, value: 0, sort: students ? 100 : item.grade }
    current.value += item.learners
    buckets.set(key, current)
  }
  return [...buckets.values()]
    .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, 'ru'))
    .map(({ key, label, value }) => ({ key, label, value }))
}

export async function dashboard(actor) {
  if (actor.role === 'super') return superDashboard()
  if (actor.role === 'regional') return regionDashboard(actor.regionId)
  if (actor.role === 'org') return orgDashboard(actor.organizationId)
  fail('Недостаточно прав', 403)
}

async function superDashboard() {
  const regions = await listRegions({ role: 'super' })
  const organizations = await count('SELECT COUNT(*) AS n FROM organizations')
  const admins = await count("SELECT COUNT(*) AS n FROM users WHERE role = 'regional'")
  const learners = regions.reduce((sum, region) => sum + region.learners, 0)
  return {
    scope: 'platform',
    note: 'Сводка по всем регионам. Результаты тестов появятся здесь вместе с темами.',
    cards: [
      { label: 'Регионов', value: regions.length },
      { label: 'Администраторов', value: admins },
      { label: 'Организаций', value: organizations },
      { label: 'Тестируемых', value: learners },
    ],
    charts: [
      chart('Тестируемые по областям', regions.map((region) => ({ key: region.id, label: region.name, labelKk: region.nameKk, value: region.learners }))),
      chart('Организации по областям', regions.map((region) => ({ key: region.id, label: region.name, labelKk: region.nameKk, value: region.organizations }))),
    ],
    table: {
      caption: 'Регионы',
      columns: ['Регион', 'Организации', 'Админы области', 'Тестируемые'],
      rows: regions.map((region) => ({
        key: region.id,
        cells: [{ ru: region.name, kk: region.nameKk }, region.organizations, region.admins, region.learners],
      })),
    },
  }
}

async function regionDashboard(regionId) {
  const region = await mustRegion(regionId)
  const orgs = (await db.all('SELECT * FROM organizations WHERE region_id = ?', regionId)).map(mapOrg)
  const ids = orgs.map((org) => org.id)
  const marks = ids.map(() => '?').join(',')
  const admins = ids.length
    ? await count(`SELECT COUNT(*) AS n FROM users WHERE role = 'org' AND organization_id IN (${marks})`, ...ids)
    : 0
  const classes = ids.length
    ? await count(`SELECT COUNT(*) AS n FROM classes WHERE organization_id IN (${marks})`, ...ids)
    : 0
  const learnersByOrg = await learnerCounts(ids)
  const learners = [...learnersByOrg.values()].reduce((sum, value) => sum + value, 0)
  const rows = await composition(ids)
  const orgRows = orgs
    .map((org) => ({
      id: org.id,
      name: org.name,
      nameKk: org.nameKk,
      classes: rows.filter((item) => item.organizationId === org.id).length,
      learners: learnersByOrg.get(org.id) || 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  const adminRows = ids.length
    ? await db.all(
      `SELECT organization_id AS id, COUNT(*) AS n FROM users WHERE role = 'org' AND organization_id IN (${marks}) GROUP BY organization_id`,
      ...ids,
    )
    : []
  const adminByOrg = new Map(adminRows.map((row) => [row.id, Number(row.n)]))
  const learnerRows = ids.length
    ? await db.all(
      `SELECT u.id, u.display_name, u.organization_id, u.class_id,
              o.name AS org_name, o.name_kk AS org_name_kk,
              c.name AS class_name, c.grade, c.band, t.name AS track_name
         FROM users u
         JOIN organizations o ON o.id = u.organization_id
         JOIN classes c ON c.id = u.class_id
         LEFT JOIN tracks t ON t.id = c.track_id
        WHERE u.role = 'learner' AND u.organization_id IN (${marks})`,
      ...ids,
    )
    : []
  const byUser = await lessonScores(learnerRows.map((row) => row.id))
  const byOrg = await privateScores(ids)
  for (const row of learnerRows) {
    const score = byUser.get(row.id)
    if (!score) continue
    const orgScore = byOrg.get(row.organization_id) || { correct: 0, answered: 0 }
    orgScore.correct += score.correct
    orgScore.answered += score.answered
    byOrg.set(row.organization_id, orgScore)
  }
  const classScores = new Map()
  for (const row of learnerRows) {
    const score = byUser.get(row.id)
    if (!score) continue
    const current = classScores.get(row.class_id) || { correct: 0, answered: 0 }
    current.correct += score.correct
    current.answered += score.answered
    classScores.set(row.class_id, current)
  }
  const classRows = [...rows].sort((a, b) => classCaption(a).localeCompare(classCaption(b), 'ru'))
  const people = [...learnerRows].sort((a, b) => String(a.display_name).localeCompare(String(b.display_name), 'ru'))
  const orgRate = (id) => rateOf(byOrg.get(id))
  const classRate = (id) => rateOf(classScores.get(id))
  const userRate = (id) => rateOf(byUser.get(id))
  return {
    scope: 'region',
    title: region.name,
    note: 'Вся статистика региона. Результаты тестов появятся здесь вместе с темами.',
    cards: [
      { label: 'Организаций', value: orgs.length, section: 'organizations' },
      { label: 'Администраторов', value: admins },
      { label: 'Классов', value: classes, section: 'classes' },
      { label: 'Тестируемых', value: learners, section: 'learners' },
    ],
    sections: {
      organizations: {
        charts: [
          chart('Тестируемые по организациям', orgRows.map((org) => ({ key: org.id, label: org.name, labelKk: org.nameKk, value: org.learners }))),
          chart('Верные ответы по организациям', orgRows.map((org) => percentItem(org.id, org.name, org.nameKk, orgRate(org.id))), 'given'),
        ],
        groupColumns: ['Организация', 'Классы', 'Тестируемые', 'Верных ответов'],
        groups: orgRows.map((org) => ({
          key: org.id,
          summary: [{ ru: org.name, kk: org.nameKk }, org.classes, org.learners, rateCell(orgRate(org.id))],
          table: classDetail(classRows.filter((item) => item.organizationId === org.id), classRate),
        })),
        table: {
          caption: 'Организации',
          columns: ['Организация', 'Классы', 'Тестируемые', 'Верных ответов'],
          rows: orgRows.map((org) => ({
            key: org.id,
            cells: [{ ru: org.name, kk: org.nameKk }, org.classes, org.learners, rateCell(orgRate(org.id))],
          })),
        },
      },
      classes: {
        charts: [
          chart('Тестируемые по классам', classRows.map((item) => ({ key: item.id, label: classCaption(item), value: item.learners })), 'given'),
          chart('Верные ответы по классам', classRows.map((item) => percentItem(item.id, classCaption(item), '', classRate(item.id))), 'given'),
        ],
        groupColumns: ['Организация', 'Классы'],
        groups: orgRows.map((org) => {
          const items = classRows.filter((item) => item.organizationId === org.id)
          return {
            key: org.id,
            summary: [
              { ru: org.name, kk: org.nameKk },
              items.length ? items.map((item) => classCaption(item)).join(', ') : 'нет классов',
            ],
            table: classDetail(items, classRate),
          }
        }),
        table: {
          caption: 'Классы',
          columns: ['Класс', 'Организация', 'Тестируемые', 'Верных ответов'],
          rows: classRows.map((item) => {
            const org = orgRows.find((entry) => entry.id === item.organizationId)
            return {
              key: item.id,
              cells: [classCaption(item), { ru: org?.name || '', kk: org?.nameKk || '' }, item.learners, rateCell(classRate(item.id))],
            }
          }),
        },
      },
      learners: {
        charts: [
          chart('Верные ответы по тестируемым', people.map((item) => percentItem(item.id, item.display_name, '', userRate(item.id))), 'given'),
        ],
        groupColumns: ['Организация', 'Тестируемые', 'Верных ответов'],
        groups: orgRows.map((org) => ({
          key: org.id,
          summary: [{ ru: org.name, kk: org.nameKk }, org.learners, rateCell(orgRate(org.id))],
          groupColumns: ['Класс', 'Тестируемые', 'Верных ответов'],
          groups: classRows
            .filter((item) => item.organizationId === org.id)
            .map((item) => ({
              key: item.id,
              summary: [classCaption(item), item.learners, rateCell(classRate(item.id))],
              empty: 'нет тестируемых',
              table: {
                columns: ['Тестируемый', 'Верных ответов'],
                rows: people
                  .filter((person) => person.class_id === item.id)
                  .map((person) => ({
                    key: person.id,
                    cells: [person.display_name, rateCell(userRate(person.id))],
                  })),
              },
            })),
        })),
        table: {
          caption: 'Тестируемые',
          columns: ['Тестируемый', 'Класс', 'Организация', 'Верных ответов'],
          rows: people.map((item) => ({
            key: item.id,
            cells: [item.display_name, classCaption(item), { ru: item.org_name, kk: item.org_name_kk || '' }, rateCell(userRate(item.id))],
          })),
        },
      },
    },
    charts: [
      chart('Тестируемые по организациям', orgRows.map((org) => ({ key: org.id, label: org.name, labelKk: org.nameKk, value: org.learners }))),
      chart('Тестируемые по группам', bandItems(rows, orgs), 'given'),
      chart('Тестируемые по параллелям', gradeItems(rows), 'given'),
    ],
    table: {
      caption: 'Организации',
      columns: ['Организация', 'Классы', 'Тестируемые', 'Админы'],
      rows: orgRows.map((org) => ({
        key: org.id,
        cells: [{ ru: org.name, kk: org.nameKk }, org.classes, org.learners, adminByOrg.get(org.id) || 0],
      })),
    },
  }
}

async function orgDashboard(organizationId) {
  const org = await mustOrg(organizationId)
  const rows = await composition([org.id])
  const learners = rows.reduce((sum, item) => sum + item.learners, 0)
  const admins = await count("SELECT COUNT(*) AS n FROM users WHERE role = 'org' AND organization_id = ?", org.id)
  const classRows = [...rows].sort((a, b) => classCaption(a).localeCompare(classCaption(b), 'ru'))
  const learnerRows = await db.all(
    `SELECT id, display_name, class_id FROM users WHERE role = 'learner' AND organization_id = ?`,
    org.id,
  )
  const byUser = await lessonScores(learnerRows.map((row) => row.id))
  const classById = new Map(classRows.map((item) => [item.id, item]))
  const classScores = new Map()
  const bandScores = new Map()
  for (const row of learnerRows) {
    const score = byUser.get(row.id)
    if (!score) continue
    const current = classScores.get(row.class_id) || { correct: 0, answered: 0 }
    current.correct += score.correct
    current.answered += score.answered
    classScores.set(row.class_id, current)
    const band = classById.get(row.class_id)?.band
    if (!band) continue
    const bandScore = bandScores.get(band) || { correct: 0, answered: 0 }
    bandScore.correct += score.correct
    bandScore.answered += score.answered
    bandScores.set(band, bandScore)
  }
  const people = [...learnerRows].sort((a, b) => String(a.display_name).localeCompare(String(b.display_name), 'ru'))
  const classRate = (id) => rateOf(classScores.get(id))
  const userRate = (id) => rateOf(byUser.get(id))
  const bandRate = (id) => rateOf(bandScores.get(id))
  const classFolds = classRows.map((item) => ({
    key: item.id,
    summary: [classCaption(item), item.learners, rateCell(classRate(item.id))],
    empty: 'нет тестируемых',
    table: {
      columns: ['Тестируемый', 'Верных ответов'],
      rows: people
        .filter((person) => person.class_id === item.id)
        .map((person) => ({
          key: person.id,
          cells: [person.display_name, rateCell(userRate(person.id))],
        })),
    },
  }))
  const bands = BANDS.filter((band) => org.groups[band.id])
  const bandCount = (id) => classRows.filter((item) => item.band === id).reduce((sum, item) => sum + item.learners, 0)
  return {
    scope: 'organization',
    title: org.name,
    note: 'Вся статистика организации. Результаты тестов появятся здесь вместе с темами.',
    cards: [
      { label: 'Классов', value: rows.length, section: 'classes' },
      { label: 'Тестируемых', value: learners, section: 'learners' },
      { label: 'Групп', value: bands.length, section: 'groups' },
      { label: 'Администраторов', value: admins },
    ],
    sections: {
      classes: {
        charts: [
          chart('Тестируемые по классам', classRows.map((item) => ({ key: item.id, label: classCaption(item), value: item.learners })), 'given'),
          chart('Верные ответы по классам', classRows.map((item) => percentItem(item.id, classCaption(item), '', classRate(item.id))), 'given'),
        ],
        groupColumns: ['Класс', 'Тестируемые', 'Верных ответов'],
        groups: classFolds,
        table: { caption: 'Классы' },
      },
      learners: {
        charts: [
          chart('Верные ответы по тестируемым', people.map((item) => percentItem(item.id, item.display_name, '', userRate(item.id))), 'given'),
        ],
        groupColumns: ['Класс', 'Тестируемые', 'Верных ответов'],
        groups: classFolds,
        table: { caption: 'Тестируемые' },
      },
      groups: {
        charts: [
          chart('Тестируемые по группам', bands.map((band) => ({ key: band.id, label: band.label, value: bandCount(band.id) })), 'given'),
          chart('Верные ответы по группам', bands.map((band) => percentItem(band.id, band.label, undefined, bandRate(band.id))), 'given'),
        ],
        groupColumns: ['Группа', 'Тестируемые', 'Верных ответов'],
        groups: bands.map((band) => ({
          key: band.id,
          summary: [band.label, bandCount(band.id), rateCell(bandRate(band.id))],
          table: classDetail(classRows.filter((item) => item.band === band.id), classRate),
        })),
        table: { caption: 'Группы' },
      },
    },
    charts: [
      chart('Тестируемые по классам', classRows.map((item) => ({ key: item.id, label: item.name, value: item.learners }))),
      chart('Тестируемые по группам', bandItems(rows, [org]), 'given'),
      chart('Тестируемые по параллелям', gradeItems(rows), 'given'),
    ],
    table: {
      caption: 'Классы',
      columns: ['Класс', 'Параллель', 'Тестируемые'],
      rows: classRows.map((item) => ({
        key: item.id,
        cells: [item.name, item.band === 'students' ? (item.trackName || 'Студенты') : `${item.grade} класс`, item.learners],
      })),
    },
  }
}

function tallyQuiz(row, runs, access, mistakes, orgScores) {
  const questions = parseJson(row.questions, [])
  const list = Array.isArray(questions) ? questions : []
  const byId = new Map(list.filter((item) => item?.id).map((item) => [item.id, item]))
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
    questionCount: list.length,
    runs: runs.length,
    participants: players.length,
    correct,
    answered: answeredTotal,
    rate: answeredTotal ? Math.round((correct / answeredTotal) * 100) : null,
  }
}

async function regionCatalog() {
  const regions = await db.all('SELECT id, name, name_kk FROM regions')
  const districtCounts = new Map((await db.all('SELECT region_id AS id, COUNT(*) AS n FROM districts GROUP BY region_id')).map((row) => [row.id, Number(row.n)]))
  const orgCounts = new Map((await db.all('SELECT region_id AS id, COUNT(*) AS n FROM organizations GROUP BY region_id')).map((row) => [row.id, Number(row.n)]))
  const learnerRows = await db.all(
    `SELECT u.id, o.region_id
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
      WHERE u.role = 'learner'`,
  )
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
  totals.rate = totals.answered ? Math.round((totals.correct / totals.answered) * 100) : null
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
  let regionId = null
  if (actor.role === 'regional') {
    regionId = actor.regionId
    if (!regionId) fail('Недостаточно прав', 403)
  } else if (requestedRegionId) {
    await mustRegion(requestedRegionId)
    regionId = requestedRegionId
  } else {
    return regionCatalog()
  }
  const region = await mustRegion(regionId)
  const districtRows = await db.all(
    `SELECT d.id, d.name, d.name_kk, r.name AS region_name, r.name_kk AS region_name_kk,
            (SELECT COUNT(*) FROM organizations o WHERE o.district_id = d.id) AS organizations,
            (SELECT COUNT(*) FROM users u
               JOIN organizations o ON o.id = u.organization_id
              WHERE u.role = 'learner' AND o.district_id = d.id) AS learners
       FROM districts d
       JOIN regions r ON r.id = d.region_id
      WHERE d.region_id = ?
      ORDER BY r.name, d.sort_order, d.name`,
    regionId,
  )
  const orgRows = await db.all(
    `SELECT o.id, o.district_id, o.name, o.name_kk, d.name AS district_name, d.name_kk AS district_name_kk,
            r.name AS region_name, r.name_kk AS region_name_kk,
            (SELECT COUNT(*) FROM classes c WHERE c.organization_id = o.id) AS classes,
            (SELECT COUNT(*) FROM users u WHERE u.role = 'learner' AND u.organization_id = o.id) AS learners
       FROM organizations o
       JOIN regions r ON r.id = o.region_id
       LEFT JOIN districts d ON d.id = o.district_id
      WHERE o.region_id = ?
      ORDER BY r.name, o.name`,
    regionId,
  )
  const lessonRows = await db.all(
    `SELECT id, title, title_kk, format, grades_1_4, grades_5_9, grades_10_11, students, questions, questions_kk
       FROM lessons
      ORDER BY created_at DESC`,
  )
  const roster = await db.all(
    `SELECT u.id, u.display_name, o.id AS organization_id, o.district_id, c.band
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
       LEFT JOIN classes c ON c.id = u.class_id
      WHERE u.role = 'learner' AND o.region_id = ?`,
    regionId,
  )
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
  const lessonOrg = new Map()
  const districtScores = new Map()
  const attemptRows = await db.all(
    `SELECT a.lesson_id, a.user_id, a.lang, a.answers
       FROM lesson_attempts a
       JOIN users u ON u.id = a.user_id
       JOIN organizations o ON o.id = u.organization_id
      WHERE u.role = 'learner' AND o.region_id = ?`,
    regionId,
  )
  const attemptsByLesson = new Map()
  for (const row of attemptRows) {
    const list = attemptsByLesson.get(row.lesson_id) || []
    list.push(row)
    attemptsByLesson.set(row.lesson_id, list)
  }
  const quizRows = await db.all('SELECT id, title, questions FROM quizzes ORDER BY updated_at DESC')
  const resultRows = await db.all(
    `SELECT r.quiz_id, r.quiz_title, r.players, r.access, r.organization_id, r.band
       FROM results r
       JOIN organizations o ON o.id = r.organization_id
      WHERE o.region_id = ?`,
    regionId,
  )
  const resultsByQuiz = new Map()
  for (const row of resultRows) {
    const key = row.quiz_id || row.quiz_title
    const list = resultsByQuiz.get(key) || []
    list.push(row)
    resultsByQuiz.set(key, list)
  }
  const mistakes = new Map()
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
  const activeLearners = new Set()
  const activeOrgs = new Set()
  const totals = { attempts: 0, correct: 0, answered: 0, quizRuns: 0, quizParticipants: 0, quizCorrect: 0, quizAnswered: 0 }
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
      rate: answeredTotal ? Math.round((correct / answeredTotal) * 100) : null,
    }
  })
  for (const district of districts) {
    const score = districtScores.get(district.id) || { correct: 0, answered: 0 }
    district.correct = score.correct
    district.answered = score.answered
    district.rate = score.answered ? Math.round((score.correct / score.answered) * 100) : null
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
    const runs = resultsByQuiz.get(row.id) || []
    const publicRuns = runs.filter((item) => item.access !== 'private')
    const privateRuns = runs.filter((item) => item.access === 'private')
    if (!row.deleted) {
      publicQuizzes.push(tallyQuiz(row, publicRuns, 'public', mistakes, orgScores))
      notePublicQuiz(row, publicRuns, quizPublic)
    }
    const privateTally = tallyQuiz(row, privateRuns, 'private', mistakes, orgScores)
    totals.quizRuns += privateTally.runs
    totals.quizParticipants += privateTally.participants
    totals.quizCorrect += privateTally.correct
    totals.quizAnswered += privateTally.answered
    for (const result of privateRuns) if (result.organization_id) activeOrgs.add(result.organization_id)
    for (const result of privateRuns) notePrivateQuiz(row, result, quizPrivate, peopleById, learnersByName)
  }
  // Доля верных у организации: ответы в тестах уроков и в приватных квизах вместе.
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
    org.rate = score.answered ? Math.round((score.correct / score.answered) * 100) : null
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
      rate: totals.answered ? Math.round((totals.correct / totals.answered) * 100) : null,
      quizRate: totals.quizAnswered ? Math.round((totals.quizCorrect / totals.quizAnswered) * 100) : null,
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

// Статистика одной организации: классы, тестируемые, уроки, приватные квизы
// и вопросы с ошибками. Администратор организации видит свою, регион и
// суперглавный — любую доступную им.
export async function orgStats(actor, requestedOrgId = null) {
  let organizationId = null
  if (actor.role === 'org') organizationId = actor.organizationId
  else if (actor.role === 'regional' || actor.role === 'super') organizationId = requestedOrgId
  else fail('Недостаточно прав', 403)
  if (!organizationId) fail('Организация не найдена', 404)
  const org = await mustOrg(organizationId)
  if (actor.role === 'regional' && org.regionId !== actor.regionId) fail('Организация не найдена', 404)
  const region = await mustRegion(org.regionId)
  const classRows = await composition([org.id])
  const learnerRows = await db.all(
    `SELECT id, display_name, login, class_id FROM users WHERE role = 'learner' AND organization_id = ?`,
    org.id,
  )
  const attemptRows = await db.all(
    `SELECT a.lesson_id, a.user_id, a.lang, a.answers, a.finished_at
       FROM lesson_attempts a
       JOIN users u ON u.id = a.user_id
      WHERE u.role = 'learner' AND u.organization_id = ?`,
    org.id,
  )
  const lessonRows = await db.all(
    `SELECT id, title, title_kk, format, grades_1_4, grades_5_9, grades_10_11, students, questions, questions_kk
       FROM lessons
      ORDER BY created_at DESC`,
  )
  const resultRows = await db.all(
    `SELECT quiz_id, quiz_title, players, started_at, finished_at
       FROM results
      WHERE access = 'private' AND organization_id = ?`,
    org.id,
  )
  const quizIds = [...new Set(resultRows.map((row) => row.quiz_id).filter(Boolean))]
  const quizRows = quizIds.length
    ? await db.all(`SELECT id, title, questions FROM quizzes WHERE id IN (${quizIds.map(() => '?').join(',')})`, ...quizIds)
    : []

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
    const attempts = attemptsByLesson.get(row.id) || []
    if (!assigned && !attempts.length) continue
    const ru = questionMap(row.questions)
    const kk = questionMap(row.questions_kk)
    const learners = new Set()
    let correct = 0
    let answered = 0
    for (const attempt of attempts) {
      const person = people.get(attempt.user_id)
      if (!person) continue
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
    totals.attempts += attempts.filter((attempt) => people.has(attempt.user_id)).length
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

  const quizById = new Map(quizRows.map((row) => [row.id, row]))
  const quizStats = new Map()
  for (const result of resultRows) {
    const row = quizById.get(result.quiz_id) || { id: result.quiz_id || result.quiz_title, title: result.quiz_title, questions: '[]' }
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
    const questions = parseJson(row.questions, [])
    const byId = new Map((Array.isArray(questions) ? questions : []).filter((item) => item?.id).map((item) => [item.id, item]))
    for (const player of seated) {
      stat.participants += 1
      const counts = countedQuizAnswers(row, player)
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
  const loose = organizations.filter((org) => !org.districtId)
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

function countedQuizAnswers(row, player) {
  const questions = parseJson(row.questions, [])
  const list = Array.isArray(questions) ? questions : []
  const byId = new Map(list.filter((item) => item?.id).map((item) => [item.id, item]))
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

function notePublicQuiz(row, runs, quizPublic) {
  const stat = { runs: runs.length, users: new Map() }
  for (const result of runs) {
    const seated = parseJson(result.players, [])
    if (!Array.isArray(seated)) continue
    for (const player of seated) {
      const user = quizPlayerSlot(stat, player.name)
      const counts = countedQuizAnswers(row, player)
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

function notePrivateQuiz(row, result, quizPrivate, peopleById, learnersByName) {
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
    const counts = countedQuizAnswers(row, player)
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
  const loose = organizations.filter((org) => !org.districtId)
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
