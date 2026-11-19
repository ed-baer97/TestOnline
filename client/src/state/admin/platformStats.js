import { api } from '../../api/index.js'
import { useResource } from '../resource.js'

export function usePlatformStats(regionId) {
  return useResource(`platform-stats:${regionId || ''}`, () => api.platformStats(regionId || undefined))
}

export function useOrgStats(orgId) {
  return useResource(`org-stats:${orgId || ''}`, () => api.orgStats(orgId || undefined))
}
