import type { Profile, RoleName, Workspace } from '../shared/types';

const adminRoles: RoleName[] = ['superadmin', 'SAT', 'Gerencia'];
const backOfficeRoles: RoleName[] = ['superadmin', 'SAT', 'Gerencia', 'Oficina'];
const operationalRoles: RoleName[] = ['superadmin', 'SAT', 'Gerencia', 'Tecnico'];
const lifecycleRoles: RoleName[] = ['superadmin', 'SAT', 'Gerencia'];
const workspaceByRole: Record<RoleName, Workspace> = {
  superadmin: 'superadmin',
  SAT: 'sat',
  Comercial: 'comercial',
  Oficina: 'oficina',
  Gerencia: 'gerencia',
  Tecnico: 'tecnico',
};

export const permissionMatrix: Record<RoleName, string[]> = {
  superadmin: ['*'],
  Gerencia: ['ver clientes','ver centros','ver equipos','ver partes','crear partes','editar partes','asignar técnicos','ver checks','ver facturación','ver documentación','ver auditoría'],
  SAT: ['ver clientes','crear clientes','editar clientes','ver centros','crear centros','editar centros','ver equipos','crear equipos','editar equipos','ver partes','crear partes','editar partes','asignar técnicos','ver checks','crear checks','ejecutar checks','sincronizar trabajo técnico','ver documentación','gestionar plantillas'],
  Comercial: ['ver clientes','crear clientes','editar clientes','ver centros','ver equipos','ver partes','crear partes','ver checks','ver documentación'],
  Oficina: ['ver clientes','ver centros','ver equipos','ver partes','editar partes','ver checks','ver facturación','ver documentación'],
  Tecnico: ['ver partes','editar partes','ver checks','ejecutar checks','sincronizar trabajo técnico','ver documentación'],
};

export function canRole(permissionRole: string, permission: string) {
  const role = permissionRole as RoleName;
  return permissionMatrix[role]?.includes('*') || permissionMatrix[role]?.includes(permission) || false;
}

function rolesOf(profile?: Profile | null) {
  return [...new Set([profile?.primary_area, ...(profile?.roles ?? [])].filter(Boolean))] as RoleName[];
}

export function normalizedRoleNames(primaryArea: RoleName, roles: RoleName[] = []) {
  const normalized = [...new Set([primaryArea, ...roles])];
  return normalized.includes('SAT') ? normalized.filter((role) => role !== 'Comercial') : normalized;
}

export function profileWorkspaces(profile: Profile | null | undefined): Workspace[] {
  if (!profile) return [];
  const roles = normalizedRoleNames(profile.primary_area, profile.roles);
  if (roles.includes('superadmin')) return ['superadmin'];
  if (roles.includes('SAT')) return ['sat'];
  return roles.map((role) => workspaceByRole[role]).filter(Boolean);
}

function hasAny(profile: Profile | null | undefined, roles: RoleName[]) {
  return rolesOf(profile).some((role) => roles.includes(role));
}

function isActiveProfile(profile: Profile | null | undefined) {
  return !!profile?.active && !profile.deleted_at;
}

function sameCompanyOrSuperadmin(profile: Profile | null | undefined, entity?: any) {
  if (!profile) return false;
  if (entity?.global_scope_authorized === true && hasAny(profile, ['superadmin'])) return true;
  return !entity?.company_id || entity.company_id === profile.company_id;
}

export function canArchiveEntity(profile: Profile | null | undefined, entity?: any) {
  if (!isActiveProfile(profile) || !sameCompanyOrSuperadmin(profile, entity)) return false;
  if (entity?.lifecycle_entity === 'profiles') return hasAny(profile, ['superadmin']);
  return hasAny(profile, lifecycleRoles);
}

export function canRestoreEntity(profile: Profile | null | undefined, entity?: any) {
  return canArchiveEntity(profile, entity);
}

export function canPermanentlyDeleteEntity(profile: Profile | null | undefined, entity?: any) {
  return canArchiveEntity(profile, entity);
}

export function canViewWorkOrder(profile: Profile | null | undefined, workOrder?: any) {
  if (!profile) return false;
  if (hasAny(profile, ['superadmin', 'SAT', 'Gerencia', 'Oficina', 'Comercial'])) return true;
  if (!hasAny(profile, ['Tecnico'])) return false;
  const profileIds = new Set([profile.id, profile.auth_user_id].filter(Boolean));
  if (profileIds.has(workOrder?.main_technician_id) || profileIds.has(workOrder?.technician_id) || profileIds.has(workOrder?.primary_technician?.id) || profileIds.has(workOrder?.primary_technician?.auth_user_id)) return true;
  const assignments = workOrder?.assignments ?? workOrder?.work_order_assignments ?? [];
  return assignments.some((item: any) => [item.technician_id, item.technician_profile_id, item.profile_id, item.assigned_profile_id, item.profiles?.id, item.profiles?.auth_user_id, item.technician?.id, item.technician?.auth_user_id].some((value) => profileIds.has(value)));
}

export function canEditWorkOrder(profile: Profile | null | undefined) { return hasAny(profile, adminRoles); }
export function canCreateWorkOrder(profile: Profile | null | undefined) { return hasAny(profile, ['superadmin', 'SAT', 'Gerencia', 'Comercial']); }
export function canAssignTechnician(profile: Profile | null | undefined) { return hasAny(profile, adminRoles); }
export function canManageWorkOrderAssignments(profile: Profile | null | undefined) { return hasAny(profile, adminRoles); }
export function canManagePlanning(profile: Profile | null | undefined) { return hasAny(profile, adminRoles); }
export function canChangePriority(profile: Profile | null | undefined) { return hasAny(profile, adminRoles); }
export function canExecuteWorkOrder(profile: Profile | null | undefined) { return hasAny(profile, operationalRoles); }
export function canCreateCheck(profile: Profile | null | undefined) { return hasAny(profile, operationalRoles); }
export function canExecuteCheck(profile: Profile | null | undefined) { return hasAny(profile, operationalRoles); }
export function canManageCheck(profile: Profile | null | undefined) { return hasAny(profile, ['superadmin', 'SAT']); }
export function canViewCheck(profile: Profile | null | undefined, check?: any) {
  if (!profile) return false;
  if (hasAny(profile, ['superadmin', 'SAT', 'Gerencia', 'Oficina', 'Comercial'])) return true;
  if (!hasAny(profile, ['Tecnico'])) return false;
  const profileIds = new Set([profile.id, profile.auth_user_id].filter(Boolean));
  if (profileIds.has(check?.technician_id) || profileIds.has(check?.profiles?.id) || profileIds.has(check?.profiles?.auth_user_id)) return true;
  return canViewWorkOrder(profile, check?.work_orders ?? check?.work_order);
}
export function canCreateAlert(profile: Profile | null | undefined) { return hasAny(profile, ['SAT', 'Gerencia', 'Comercial']); }
export function canManageAlert(profile: Profile | null | undefined) { return hasAny(profile, [...backOfficeRoles, 'Comercial', 'Tecnico']); }
export function canCloseWorkOrder(profile: Profile | null | undefined) { return hasAny(profile, adminRoles); }
export function canReopenWorkOrder(profile: Profile | null | undefined) { return hasAny(profile, adminRoles); }

export function canAccessModule(profile: Profile | null | undefined, workspace: Workspace, moduleId: string) {
  if (!profile) return false;
  if (workspace === 'superadmin') return hasAny(profile, ['superadmin']);
  if (workspace === 'tecnico') return ['jornada', 'checks', 'avisos'].includes(moduleId);
  if (workspace === 'sat') return hasAny(profile, ['SAT', 'Gerencia']) && !['comerciales'].includes(moduleId);
  if (workspace === 'comercial') return hasAny(profile, ['Comercial', 'Gerencia', 'SAT']);
  if (workspace === 'oficina') return hasAny(profile, ['Oficina', 'Gerencia']);
  if (workspace === 'gerencia') return hasAny(profile, ['Gerencia']);
  return false;
}

export function canAccessRoute(profile: Profile | null | undefined, path: string) {
  if (!profile) return false;
  const roles = rolesOf(profile);
  if (!roles.length || !roles.some((role) => roleToWorkspaceSafe(role))) return false;
  if (path.startsWith('/app/superadmin')) return hasAny(profile, ['superadmin']);
  if (path.startsWith('/app/tecnico') || path.startsWith('/app/pendientes')) return hasAny(profile, ['Tecnico']);
  if (hasAny(profile, ['superadmin'])) return false;
  if (hasAny(profile, ['Tecnico']) && !hasAny(profile, ['SAT', 'Gerencia', 'Comercial', 'Oficina'])) {
    return path === '/app/checks' || path.startsWith('/app/checks/') || path.startsWith('/app/avisos');
  }
  if (path.startsWith('/app/plantillas')) return hasAny(profile, ['SAT', 'Gerencia']);
  if (path.startsWith('/app/clientes') || path.startsWith('/app/centros') || path.startsWith('/app/equipos') || path.startsWith('/app/expedientes') || path.startsWith('/app/partes') || path.startsWith('/app/trabajos') || path.startsWith('/app/checks') || path.startsWith('/app/deficiencias')) return hasAny(profile, ['SAT', 'Gerencia', 'Comercial']);
  if (path.startsWith('/app/documentos')) return hasAny(profile, ['SAT', 'Gerencia', 'Oficina']);
  if (path.startsWith('/app/gerencia')) return hasAny(profile, ['Gerencia']);
  if (path.startsWith('/app/modulos/tecnicos')) return hasAny(profile, ['SAT', 'Gerencia']);
  if (path.startsWith('/app/modulos/comerciales')) return hasAny(profile, ['SAT', 'Gerencia', 'Comercial']);
  if (path.startsWith('/app/modulos')) return hasAny(profile, ['SAT', 'Gerencia', 'Comercial', 'Oficina']);
  if (path.startsWith('/app/avisos')) return hasAny(profile, ['SAT', 'Gerencia', 'Comercial', 'Oficina', 'Tecnico']);
  if (path === '/app/inicio') return hasAny(profile, ['SAT', 'Gerencia', 'Comercial', 'Oficina']);
  return false;
}

function roleToWorkspaceSafe(role?: RoleName | null) {
  return role && ['superadmin', 'SAT', 'Comercial', 'Oficina', 'Gerencia', 'Tecnico'].includes(role) ? role : null;
}

export function isSuperadmin(profile: Profile | null | undefined) { return hasAny(profile, ['superadmin']); }
export function canManageUsers(profile: Profile | null | undefined) { return isSuperadmin(profile); }

export function canViewDashboardBlock(profile: Profile | null | undefined, workspace: Workspace, blockId: string) {
  return canAccessModule(profile, workspace, blockId) || ['inicio', 'resumen'].includes(blockId);
}
