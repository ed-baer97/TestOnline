import express from 'express'
import {
  createClass,
  createDistrict,
  createLearner,
  createOrgAdmin,
  createOrganization,
  createRegion,
  createRegionalAdmin,
  createTrack,
  dashboard,
  deleteClass,
  deleteDistrict,
  deleteLearner,
  deleteOrgAdmin,
  deleteOrganization,
  deleteRegion,
  deleteRegionalAdmin,
  deleteTrack,
  exportLearnersWorkbook,
  importLearners,
  importLearnersList,
  launchTargets,
  learnerTargets,
  learnersTemplate,
  listDistricts,
  listLaunchQuizzes,
  listLearners,
  listOrgAdmins,
  listOrganizations,
  listRegionalAdmins,
  listRegions,
  orgStats,
  platformStats,
  seedRegionCatalog,
  structure,
  updateClass,
  updateLearner,
  updateOrgAdmin,
  updateOrganization,
  updateRegion,
  updateRegionalAdmin,
  updateTrack,
} from '../../../services/admin/index.js'
import { requireUser, route } from '../middleware.js'

export function registerAdminRoutes(app) {
  const guard = requireUser
  app.get('/api/admin/dashboard', guard, route(async (req, res) => {
    res.json(await dashboard(req.user))
  }))
  app.get('/api/admin/platform-stats', guard, route(async (req, res) => {
    const requested = typeof req.query.regionId === 'string' ? req.query.regionId : null
    res.json(await platformStats(req.user, requested || null))
  }))
  app.get('/api/admin/org-stats', guard, route(async (req, res) => {
    const requested = typeof req.query.organizationId === 'string' ? req.query.organizationId : null
    res.json(await orgStats(req.user, requested || null))
  }))
  app.post('/api/admin/catalog', guard, route(async (req, res) => {
    res.json(await seedRegionCatalog(req.user, req.body?.regionId))
  }))
  app.get('/api/admin/districts', guard, route(async (req, res) => {
    const regionId = typeof req.query.regionId === 'string' ? req.query.regionId : null
    res.json({ districts: await listDistricts(req.user, regionId || null) })
  }))
  app.post('/api/admin/districts', guard, route(async (req, res) => {
    res.status(201).json(await createDistrict(req.user, req.body || {}))
  }))
  app.delete('/api/admin/districts/:id', guard, route(async (req, res) => {
    await deleteDistrict(req.user, req.params.id)
    res.json({ ok: true })
  }))
  app.get('/api/admin/regions', guard, route(async (req, res) => {
    res.json({ regions: await listRegions(req.user) })
  }))
  app.post('/api/admin/regions', guard, route(async (req, res) => {
    res.status(201).json(await createRegion(req.user, req.body || {}))
  }))
  app.patch('/api/admin/regions/:id', guard, route(async (req, res) => {
    res.json(await updateRegion(req.user, req.params.id, req.body || {}))
  }))
  app.delete('/api/admin/regions/:id', guard, route(async (req, res) => {
    await deleteRegion(req.user, req.params.id)
    res.json({ ok: true })
  }))
  app.get('/api/admin/regional-admins', guard, route(async (req, res) => {
    res.json({ admins: await listRegionalAdmins(req.user) })
  }))
  app.post('/api/admin/regional-admins', guard, route(async (req, res) => {
    res.status(201).json(await createRegionalAdmin(req.user, req.body || {}))
  }))
  app.patch('/api/admin/regional-admins/:id', guard, route(async (req, res) => {
    res.json(await updateRegionalAdmin(req.user, req.params.id, req.body || {}))
  }))
  app.delete('/api/admin/regional-admins/:id', guard, route(async (req, res) => {
    await deleteRegionalAdmin(req.user, req.params.id)
    res.json({ ok: true })
  }))
  app.get('/api/admin/organizations', guard, route(async (req, res) => {
    res.json({ organizations: await listOrganizations(req.user) })
  }))
  app.get('/api/admin/launch-targets', guard, route(async (req, res) => {
    res.json({ organizations: await launchTargets(req.user) })
  }))
  app.get('/api/admin/launch-quizzes', guard, route(async (req, res) => {
    res.json({ quizzes: await listLaunchQuizzes(req.user) })
  }))
  app.post('/api/admin/organizations', guard, route(async (req, res) => {
    res.status(201).json(await createOrganization(req.user, req.body || {}))
  }))
  app.patch('/api/admin/organizations/:id', guard, route(async (req, res) => {
    res.json(await updateOrganization(req.user, req.params.id, req.body || {}))
  }))
  app.delete('/api/admin/organizations/:id', guard, route(async (req, res) => {
    await deleteOrganization(req.user, req.params.id)
    res.json({ ok: true })
  }))
  app.get('/api/admin/org-admins', guard, route(async (req, res) => {
    res.json({ admins: await listOrgAdmins(req.user) })
  }))
  app.post('/api/admin/org-admins', guard, route(async (req, res) => {
    res.status(201).json(await createOrgAdmin(req.user, req.body || {}))
  }))
  app.patch('/api/admin/org-admins/:id', guard, route(async (req, res) => {
    res.json(await updateOrgAdmin(req.user, req.params.id, req.body || {}))
  }))
  app.delete('/api/admin/org-admins/:id', guard, route(async (req, res) => {
    await deleteOrgAdmin(req.user, req.params.id)
    res.json({ ok: true })
  }))
  app.get('/api/admin/structure', guard, route(async (req, res) => {
    const organizationId = typeof req.query.organizationId === 'string' ? req.query.organizationId : null
    res.json(await structure(req.user, organizationId || null))
  }))
  app.post('/api/admin/tracks', guard, route(async (req, res) => {
    res.status(201).json(await createTrack(req.user, req.body || {}))
  }))
  app.patch('/api/admin/tracks/:id', guard, route(async (req, res) => {
    res.json(await updateTrack(req.user, req.params.id, req.body || {}))
  }))
  app.delete('/api/admin/tracks/:id', guard, route(async (req, res) => {
    await deleteTrack(req.user, req.params.id)
    res.json({ ok: true })
  }))
  app.post('/api/admin/classes', guard, route(async (req, res) => {
    res.status(201).json(await createClass(req.user, req.body || {}))
  }))
  app.patch('/api/admin/classes/:id', guard, route(async (req, res) => {
    res.json(await updateClass(req.user, req.params.id, req.body || {}))
  }))
  app.delete('/api/admin/classes/:id', guard, route(async (req, res) => {
    await deleteClass(req.user, req.params.id)
    res.json({ ok: true })
  }))
  app.get('/api/admin/learners', guard, route(async (req, res) => {
    res.json(await listLearners(req.user, req.query))
  }))
  app.get('/api/admin/learners/targets', guard, route(async (req, res) => {
    res.json(await learnerTargets(req.user))
  }))
  app.get('/api/admin/learners/template', guard, route(async (req, res) => {
    if (req.user.role !== 'org' && req.user.role !== 'super') {
      res.status(403).json({ error: 'Недостаточно прав' })
      return
    }
    const mode = req.query.mode === 'fio' ? 'fio' : 'full'
    const buffer = await learnersTemplate(mode)
    const filename = mode === 'fio' ? 'spisok-fio-shablon.xlsx' : 'testiruemye-shablon.xlsx'
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(Buffer.from(buffer))
  }))
  app.post('/api/admin/learners/import', guard, express.raw({ type: () => true, limit: '5mb' }), route(async (req, res) => {
    res.json(await importLearners(req.user, req.body, {
      organizationId: typeof req.query.organizationId === 'string' ? req.query.organizationId : null,
      classId: typeof req.query.classId === 'string' ? req.query.classId : null,
    }))
  }))
  app.post('/api/admin/learners/bulk', guard, express.json({ limit: '2mb' }), route(async (req, res) => {
    res.json(await importLearnersList(req.user, req.body || {}))
  }))
  app.post('/api/admin/learners/export', guard, express.json({ limit: '2mb' }), route(async (req, res) => {
    const buffer = await exportLearnersWorkbook(req.user, req.body || {})
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="paroli-testiruemyh.xlsx"')
    res.send(Buffer.from(buffer))
  }))
  app.post('/api/admin/learners', guard, route(async (req, res) => {
    res.status(201).json(await createLearner(req.user, req.body || {}))
  }))
  app.patch('/api/admin/learners/:id', guard, route(async (req, res) => {
    res.json(await updateLearner(req.user, req.params.id, req.body || {}))
  }))
  app.delete('/api/admin/learners/:id', guard, route(async (req, res) => {
    await deleteLearner(req.user, req.params.id)
    res.json({ ok: true })
  }))
}
