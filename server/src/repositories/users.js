import { db, isUniqueViolation } from '../infrastructure/db/index.js'
import { count, countsById, placeholders } from './sql.js'

// Ошибка вставки в users из-за уникального индекса по логину (без учёта регистра).
export function isLoginTaken(error) {
  return isUniqueViolation(error)
}

export async function countUsers() {
  const row = await db.get('SELECT COUNT(*) AS n FROM users')
  return Number(row.n)
}

export async function insertHost({ id, login, passwordHash, createdAt }) {
  await db.run(
    'INSERT INTO users (id, login, password_hash, created_at) VALUES (?, ?, ?, ?)',
    id,
    login,
    passwordHash,
    createdAt,
  )
}

export async function findCredentials(login) {
  return db.get('SELECT id, login, password_hash, role FROM users WHERE lower(login) = lower(?)', login)
}

// Пользователь вместе с регионом, организацией, классом и курсом — для профиля и сессии.
export async function findProfileRow(id) {
  return db.get(
    `SELECT u.id, u.login, u.role, u.display_name, u.region_id, u.organization_id, u.class_id,
            r.name AS region_name, o.name AS organization_name,
            c.name AS class_name, c.grade, c.band, t.name AS track_name
     FROM users u
     LEFT JOIN regions r ON r.id = u.region_id
     LEFT JOIN organizations o ON o.id = u.organization_id
     LEFT JOIN classes c ON c.id = u.class_id
     LEFT JOIN tracks t ON t.id = c.track_id
     WHERE u.id = ?`,
    id,
  )
}

export async function findSuperAdmin() {
  return db.get("SELECT id FROM users WHERE role = 'super' LIMIT 1")
}

export async function findByLogin(login) {
  return db.get('SELECT id FROM users WHERE lower(login) = lower(?)', login)
}

export async function insertSuperAdmin({ id, login, passwordHash, createdAt, displayName }) {
  await db.run(
    `INSERT INTO users (id, login, password_hash, created_at, role, display_name)
     VALUES (?, ?, ?, ?, 'super', ?)`,
    id,
    login,
    passwordHash,
    createdAt,
    displayName,
  )
}

export async function insertUser({ id, login, passwordHash, createdAt, role, displayName, regionId, organizationId, classId }) {
  await db.run(
    `INSERT INTO users (id, login, password_hash, created_at, role, display_name, region_id, organization_id, class_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    login,
    passwordHash,
    createdAt,
    role,
    displayName,
    regionId,
    organizationId,
    classId,
  )
}

export async function updatePasswordHash(id, passwordHash) {
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', passwordHash, id)
}

export async function deleteUser(id) {
  await db.run('DELETE FROM users WHERE id = ?', id)
}

// Администраторы регионов

export async function countRegionalAdmins() {
  return count("SELECT COUNT(*) AS n FROM users WHERE role = 'regional'")
}

export async function countRegionalAdminsInRegion(regionId) {
  return count("SELECT COUNT(*) AS n FROM users WHERE role = 'regional' AND region_id = ?", regionId)
}

export async function listRegionalAdmins() {
  return db.all(
    `SELECT u.id, u.login, u.display_name, u.region_id, r.name AS region_name
     FROM users u JOIN regions r ON r.id = u.region_id
     WHERE u.role = 'regional'`,
  )
}

export async function findRegionalAdmin(id) {
  return db.get("SELECT id FROM users WHERE id = ? AND role = 'regional'", id)
}

export async function updateRegionalAdmin(id, { displayName, regionId }) {
  await db.run('UPDATE users SET display_name = ?, region_id = ? WHERE id = ?', displayName, regionId, id)
}

export async function deleteRegionalAdmin(id) {
  const result = await db.run("DELETE FROM users WHERE id = ? AND role = 'regional'", id)
  return result.changes
}

// Администраторы организаций

export async function countOrgAdmins(organizationId) {
  return count("SELECT COUNT(*) AS n FROM users WHERE role = 'org' AND organization_id = ?", organizationId)
}

export async function countOrgAdminsIn(organizationIds) {
  if (!organizationIds.length) return 0
  return count(`SELECT COUNT(*) AS n FROM users WHERE role = 'org' AND organization_id IN (${placeholders(organizationIds)})`, ...organizationIds)
}

export async function orgAdminCountsByOrganization(organizationIds) {
  return countsById(
    `SELECT organization_id AS id, COUNT(*) AS n FROM users WHERE role = 'org' AND organization_id IN (${placeholders(organizationIds)}) GROUP BY organization_id`,
    organizationIds,
  )
}

export async function listOrgAdminsInRegion(regionId) {
  return db.all(
    `SELECT u.id, u.login, u.display_name, u.organization_id, o.name AS organization_name
     FROM users u JOIN organizations o ON o.id = u.organization_id
     WHERE u.role = 'org' AND o.region_id = ?`,
    regionId,
  )
}

export async function findOrgAdminInRegion(id, regionId) {
  return db.get(
    `SELECT u.id FROM users u JOIN organizations o ON o.id = u.organization_id
     WHERE u.id = ? AND u.role = 'org' AND o.region_id = ?`,
    id,
    regionId,
  )
}

export async function updateOrgAdmin(id, { displayName, organizationId }) {
  await db.run('UPDATE users SET display_name = ?, organization_id = ? WHERE id = ?', displayName, organizationId, id)
}

// Тестируемые

export async function countLearnersInRegion(regionId) {
  return count(
    `SELECT COUNT(*) AS n FROM users u
     JOIN organizations o ON o.id = u.organization_id
     WHERE u.role = 'learner' AND o.region_id = ?`,
    regionId,
  )
}

export async function countLearnersInOrganization(organizationId) {
  return count("SELECT COUNT(*) AS n FROM users WHERE role = 'learner' AND organization_id = ?", organizationId)
}

export async function countLearnersInClass(classId) {
  return count("SELECT COUNT(*) AS n FROM users WHERE role = 'learner' AND class_id = ?", classId)
}

export async function learnerCountsByOrganization(organizationIds) {
  return countsById(
    `SELECT organization_id AS id, COUNT(*) AS n FROM users
     WHERE role = 'learner' AND organization_id IN (${placeholders(organizationIds)}) GROUP BY organization_id`,
    organizationIds,
  )
}

function learnerFilter({ organizationId, classId, search }) {
  const where = ["u.role = 'learner'", 'u.organization_id = ?']
  const params = [organizationId]
  if (classId) {
    where.push('u.class_id = ?')
    params.push(classId)
  }
  if (search) {
    where.push('(lower(u.display_name) LIKE lower(?) OR lower(u.login) LIKE lower(?))')
    params.push(`%${search}%`, `%${search}%`)
  }
  return { where, params }
}

export async function countLearners(filter) {
  const { where, params } = learnerFilter(filter)
  return count(
    `SELECT COUNT(*) AS n FROM users u WHERE ${where.join(' AND ')}`,
    ...params,
  )
}

export async function listLearners(filter, { limit, offset }) {
  const { where, params } = learnerFilter(filter)
  return db.all(
    `SELECT u.id, u.login, u.display_name, u.class_id, c.name AS class_name, c.grade, c.band, t.name AS track_name
     FROM users u
     JOIN classes c ON c.id = u.class_id
     LEFT JOIN tracks t ON t.id = c.track_id
     WHERE ${where.join(' AND ')}
     ORDER BY c.band, c.grade, t.name, c.name, u.display_name, u.login
     LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset,
  )
}

export async function findLearner(id, organizationId) {
  return db.get(
    "SELECT id FROM users WHERE id = ? AND role = 'learner' AND organization_id = ?",
    id,
    organizationId,
  )
}

export async function updateLearner(id, { displayName, classId }) {
  await db.run('UPDATE users SET display_name = ?, class_id = ? WHERE id = ?', displayName, classId, id)
}

export async function deleteLearner(id, organizationId) {
  const result = await db.run(
    "DELETE FROM users WHERE id = ? AND role = 'learner' AND organization_id = ?",
    id,
    organizationId,
  )
  return result.changes
}

// Логины в нижнем регистре, которые уже заняты. Запрос идёт пачками по 500, чтобы не упереться в лимит параметров.
export async function findTakenLogins(logins) {
  const taken = new Set()
  for (let start = 0; start < logins.length; start += 500) {
    const chunk = logins.slice(start, start + 500)
    const found = await db.all(`SELECT login FROM users WHERE lower(login) IN (${placeholders(chunk)})`, ...chunk)
    for (const item of found) taken.add(String(item.login).toLowerCase())
  }
  return taken
}

export async function insertLearners(learners) {
  const values = []
  const params = []
  for (const item of learners) {
    values.push('(?, ?, ?, ?, ?, ?, ?, ?)')
    params.push(item.id, item.login, item.passwordHash, item.createdAt, 'learner', item.displayName, item.organizationId, item.classId)
  }
  await db.run(
    `INSERT INTO users (id, login, password_hash, created_at, role, display_name, organization_id, class_id)
     VALUES ${values.join(', ')}`,
    ...params,
  )
}

export async function insertLearner(item) {
  await db.run(
    `INSERT INTO users (id, login, password_hash, created_at, role, display_name, organization_id, class_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    item.id, item.login, item.passwordHash, item.createdAt, 'learner', item.displayName, item.organizationId, item.classId,
  )
}
