import { useQuery } from '@tanstack/react-query';
import { checksService } from '../services/checksService';
import { equipmentService } from '../services/equipmentService';
import { profilesService } from '../services/profilesService';
import { superadminService } from '../services/superadminService';
import { materialsService } from '../services/materialsService';
import { catalogStaleTime } from './queryDefaults';
import { queryKeys } from './queryKeys';
import { workOrdersService } from '../services/workOrdersService';

export function useEquipmentTypes(companyId: string | null | undefined, admin = false) {
  return useQuery({
    queryKey: queryKeys.equipmentTypes(companyId, admin),
    queryFn: () => admin ? equipmentService.typesAdmin(companyId) : equipmentService.types(companyId),
    enabled: Boolean(companyId),
    staleTime: catalogStaleTime.long,
  });
}

export function useCheckTemplates(companyId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.checkTemplates(companyId, 'active'),
    queryFn: () => checksService.templates(null, companyId),
    enabled: Boolean(companyId),
    staleTime: catalogStaleTime.long,
  });
}

export function useManagedCheckTemplates(companyId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.checkTemplates(companyId, 'managed'),
    queryFn: () => superadminService.templates(companyId),
    enabled: Boolean(companyId),
    staleTime: catalogStaleTime.medium,
  });
}

export function useProfiles(companyId: string | null | undefined, role: 'technicians' | 'commercials' | 'active' = 'active') {
  return useQuery({
    queryKey: queryKeys.profiles(companyId, role),
    queryFn: () => role === 'technicians' ? profilesService.listTechnicians(companyId) : role === 'commercials' ? profilesService.listCommercials(companyId) : profilesService.listActive(companyId),
    enabled: Boolean(companyId),
    staleTime: catalogStaleTime.medium,
  });
}

export function useMaterialsCatalog(companyId: string | null | undefined, search = '') {
  return useQuery({
    queryKey: queryKeys.materials(companyId, search),
    queryFn: () => materialsService.list(search, companyId, 'all'),
    enabled: Boolean(companyId),
    staleTime: catalogStaleTime.medium,
  });
}

export function useOfficeValidationCapability(companyId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.capabilities(companyId),
    queryFn: () => workOrdersService.hasOfficeValidation(),
    enabled: Boolean(companyId),
    staleTime: catalogStaleTime.medium,
  });
}

export function useWorkOrderList(companyId: string | null | undefined, search: string, archiveFilter: string, dateFilters: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.workOrders.list(companyId, { search, archiveFilter, ...dateFilters }),
    // The service resolves the effective operating company, as the legacy loader did.
    queryFn: () => workOrdersService.listWithAssignments(search, undefined, archiveFilter as any, dateFilters as any),
    enabled: true,
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
}

export function useWorkOrderSummary(companyId: string | null | undefined, workOrderId: string, technicianOnly = false) {
  return useQuery({
    queryKey: queryKeys.workOrders.summary(companyId, workOrderId),
    queryFn: () => workOrdersService.getWorkOrderSummary(workOrderId, technicianOnly),
    enabled: Boolean(companyId && workOrderId),
    staleTime: 30_000,
  });
}

export function useWorkOrderDetail(companyId: string | null | undefined, workOrderId: string, enabled: boolean, technicianOnly = false) {
  return useQuery({
    queryKey: queryKeys.workOrders.detail(companyId, workOrderId),
    queryFn: () => technicianOnly ? workOrdersService.getTechnicianAssigned(workOrderId) : workOrdersService.get(workOrderId),
    enabled: Boolean(companyId && workOrderId && enabled),
    staleTime: 30_000,
  });
}
