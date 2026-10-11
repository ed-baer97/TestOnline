// Сценарии админки: суперглавный ведёт регионы, админ региона — организации, админ организации — классы и тестируемых.
export { dashboard } from './dashboard.js'
export { importLearners, learnersTemplate } from './learnersExcel.js'
export { createLearner, deleteLearner, listLearners, updateLearner } from './learners.js'
export {
  createOrgAdmin,
  createOrganization,
  deleteOrgAdmin,
  deleteOrganization,
  listOrgAdmins,
  listOrganizations,
  updateOrgAdmin,
  updateOrganization,
} from './organizations.js'
export {
  createRegion,
  createRegionalAdmin,
  deleteRegion,
  deleteRegionalAdmin,
  listRegionalAdmins,
  listRegions,
  updateRegion,
  updateRegionalAdmin,
} from './regions.js'
export { createClass, createTrack, deleteClass, deleteTrack, structure, updateClass, updateTrack } from './structure.js'


