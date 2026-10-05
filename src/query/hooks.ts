import { useQuery } from '@tanstack/react-query';
import { useQueryAccessScope } from './accessScope';
import { checksService } from '../services/checksService';
import { equipmentService } from '../services/equipmentService';
import { profilesService } from '../services/profilesService';
import { superadminService } from '../services/superadminService';
import { materialsService } from '../services/materialsService';
import { catalogStaleTime } from './queryDefaults';
import { queryKeys } from './queryKeys';
import { workOrdersService } from '../services/workOrdersService';

export function useEquipmentTypes(companyId: string | null | undefined, admin = false) {
  const accessScope = useQueryAccessScope();
  return useQuery({
    queryKey: [...queryKeys.equipmentTypes(companyId, admin), accessScope],
    queryFn: () => admin ? equipmentService.typesAdmin(companyId) : equipmentService.types(companyId),
    enabled: Boolean(companyId),
    staleTime: catalogStaleTime.long,
  });
}

export function useCheckTemplates(companyId: string | null | undefined) {
  const accessScope = useQueryAccessScope();
  return useQuery({
    queryKey: [...queryKeys.checkTemplates(companyId, 'active'), accessScope],
    queryFn: () => checksService.templates(null, companyId),
    enabled: Boolean(companyId),
    staleTime: catalogStaleTime.long,
  });
}

export function useManagedCheckTemplates(companyId: string | null | undefined) {
  const accessScope = useQueryAccessScope();
  return useQuery({
    queryKey: [...queryKeys.checkTemplates(companyId, 'managed'), accessScope],
    queryFn: () => superadminService.templates(companyId),
    enabled: Boolean(companyId),
    staleTime: catalogStaleTime.medium,
  });
}

export function useProfiles(companyId: string | null | undefined, role: 'technicians' | 'commercials' | 'active' = 'active') {
  const accessScope = useQueryAccessScope();
  return useQuery({
    queryKey: [...queryKeys.profiles(companyId, role), accessScope],
    queryFn: () => role === 'technicians' ? profilesService.listTechnicians(companyId) : role === 'commercials' ? profilesService.listCommercials(companyId) : profilesService.listActive(companyId),
    enabled: Boolean(companyId),
    staleTime: catalogStaleTime.medium,
  });
}

export function useMaterialsCatalog(companyId: string | null | undefined, search = '') {
  const accessScope = useQueryAccessScope();
  return useQuery({
    queryKey: [...queryKeys.materials(companyId, search), accessScope],
    queryFn: () => materialsService.list(search, companyId, 'all'),
    enabled: Boolean(companyId),
    staleTime: catalogStaleTime.medium,
  });
}

export function useOfficeValidationCapability(companyId: string | null | undefined) {
  const accessScope = useQueryAccessScope();
  return useQuery({
    queryKey: [...queryKeys.capabilities(companyId), accessScope],
    queryFn: () => workOrdersService.hasOfficeValidation(),
    enabled: Boolean(companyId),
    staleTime: catalogStaleTime.medium,
  });
}

export function useWorkOrderList(companyId: string | null | undefined, search: string, archiveFilter: string, dateFilters: Record<string, unknown>) {
  const accessScope = useQueryAccessScope();
  return useQuery({
    queryKey: [...queryKeys.workOrders.list(companyId, { search, archiveFilter, ...dateFilters }), accessScope],
    // The service resolves the effective operating company, as the legacy loader did.
    queryFn: () => workOrdersService.listWithAssignments(search, undefined, archiveFilter as any, dateFilters as any),
    enabled: true,
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey.at(-1) === accessScope ? previous : undefined,
    staleTime: 30_000,
  });
}

export function useWorkOrderSummary(companyId: string | null | undefined, workOrderId: string, technicianOnly = false) {
  const accessScope = useQueryAccessScope();
  return useQuery({
    queryKey: [...queryKeys.workOrders.summary(companyId, workOrderId, technicianOnly), accessScope],
    queryFn: () => workOrdersService.getWorkOrderSummary(workOrderId, technicianOnly),
    enabled: Boolean(companyId && workOrderId),
    staleTime: 30_000,
  });
}

export function useWorkOrderDetail(companyId: string | null | undefined, workOrderId: string, enabled: boolean, technicianOnly = false) {
  const accessScope = useQueryAccessScope();
  return useQuery({
    queryKey: [...queryKeys.workOrders.detail(companyId, workOrderId, technicianOnly), accessScope],
    queryFn: () => technicianOnly ? workOrdersService.getTechnicianAssigned(workOrderId) : workOrdersService.get(workOrderId),
    enabled: Boolean(companyId && workOrderId && enabled),
    staleTime: 30_000,
  });
}
