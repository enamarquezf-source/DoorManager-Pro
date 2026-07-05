import type { Profile, RoleName, Workspace } from '../shared/types';

const adminRoles: RoleName[] = ['SAT', 'Gerencia'];
const backOfficeRoles: RoleName[] = ['SAT', 'Gerencia', 'Oficina'];
const operationalRoles: RoleName[] = ['SAT', 'Gerencia', 'Tecnico'];

function rolesOf(profile?: Profile | null) {
  return profile?.roles?.length ? profile.roles : profile?.primary_area ? [profile.primary_area] : [];
}

function hasAny(profile: Profile | null | undefined, roles: RoleName[]) {
  return rolesOf(profile).some((role) => roles.includes(role));
}

export function canViewWorkOrder(profile: Profile | null | undefined, workOrder?: any) {
  if (!profile) return false;
  if (hasAny(profile, ['SAT', 'Gerencia', 'Oficina', 'Comercial'])) return true;
  if (!hasAny(profile, ['Tecnico'])) return false;
  const profileIds = new Set([profile.id, profile.auth_user_id].filter(Boolean));
  if (profileIds.has(workOrder?.main_technician_id) || profileIds.has(workOrder?.technician_id) || profileIds.has(workOrder?.primary_technician?.id) || profileIds.has(workOrder?.primary_technician?.auth_user_id)) return true;
  const assignments = workOrder?.assignments ?? workOrder?.work_order_assignments ?? [];
  return assignments.some((item: any) => [item.technician_id, item.technician_profile_id, item.profile_id, item.assigned_profile_id, item.profiles?.id, item.profiles?.auth_user_id, item.technician?.id, item.technician?.auth_user_id].some((value) => profileIds.has(value)));
}

export function canEditWorkOrder(profile: Profile | null | undefined) { return hasAny(profile, adminRoles); }
export function canCreateWorkOrder(profile: Profile | null | undefined) { return hasAny(profile, ['SAT', 'Gerencia', 'Comercial']); }
export function canAssignTechnician(profile: Profile | null | undefined) { return hasAny(profile, adminRoles); }
export function canManagePlanning(profile: Profile | null | undefined) { return hasAny(profile, adminRoles); }
export function canChangePriority(profile: Profile | null | undefined) { return hasAny(profile, adminRoles); }
export function canExecuteWorkOrder(profile: Profile | null | undefined) { return hasAny(profile, operationalRoles); }
export function canCreateCheck(profile: Profile | null | undefined) { return hasAny(profile, operationalRoles); }
export function canExecuteCheck(profile: Profile | null | undefined) { return hasAny(profile, operationalRoles); }
export function canCreateAlert(profile: Profile | null | undefined) { return hasAny(profile, ['SAT', 'Gerencia', 'Comercial', 'Tecnico']); }
export function canManageAlert(profile: Profile | null | undefined) { return hasAny(profile, [...backOfficeRoles, 'Comercial', 'Tecnico']); }
export function canCloseWorkOrder(profile: Profile | null | undefined) { return hasAny(profile, adminRoles); }
export function canReopenWorkOrder(profile: Profile | null | undefined) { return hasAny(profile, adminRoles); }

export function canAccessModule(profile: Profile | null | undefined, workspace: Workspace, moduleId: string) {
  if (!profile) return false;
  if (workspace === 'tecnico') return ['jornada', 'checks', 'avisos'].includes(moduleId);
  if (workspace === 'sat') return hasAny(profile, ['SAT', 'Gerencia']);
  if (workspace === 'comercial') return hasAny(profile, ['Comercial', 'Gerencia', 'SAT']);
  if (workspace === 'oficina') return hasAny(profile, ['Oficina', 'Gerencia']);
  if (workspace === 'gerencia') return hasAny(profile, ['Gerencia']);
  return false;
}

export function canViewDashboardBlock(profile: Profile | null | undefined, workspace: Workspace, blockId: string) {
  return canAccessModule(profile, workspace, blockId) || ['inicio', 'resumen'].includes(blockId);
}
