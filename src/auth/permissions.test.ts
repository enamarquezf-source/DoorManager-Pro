import { describe, expect, it } from 'vitest';
import { canAccessRoute, canArchiveEntity, canCreateAlert, canManageCheck, canManageWorkOrderAssignments, canManageWorkOrderMaterials, canManageWorkOrderStatus, canManageWorkOrderTime, canPermanentlyDeleteEntity, canRestoreEntity, canRole, canViewCheck, canViewWorkOrderCosts, isSuperadmin, normalizedRoleNames, profileWorkspaces } from './permissions';
import type { Profile, RoleName } from '../shared/types';

function profile(primary_area: RoleName, roles: RoleName[] = []): Profile {
  return { id: `${primary_area}-id`, company_id: 'company-id', auth_user_id: `${primary_area}-auth`, first_name: primary_area, last_name: 'Test', email: `${primary_area}@test.local`, phone: null, primary_area, active: true, roles };
}

describe('canAccessRoute', () => {
  it('normaliza SAT con Comercial a un unico workspace SAT', () => {
    const sat = profile('SAT', ['SAT', 'Comercial']);
    expect(profileWorkspaces(sat)).toEqual(['sat']);
    expect(normalizedRoleNames('SAT', ['Comercial'])).toEqual(['SAT']);
  });

  it('mantiene Comercial puro en workspace comercial', () => {
    const comercial = profile('Comercial', ['Comercial']);
    expect(profileWorkspaces(comercial)).toEqual(['comercial']);
    expect(normalizedRoleNames('Comercial', [])).toEqual(['Comercial']);
  });

  it('permite al tecnico acceder a checks y avisos', () => {
    const tecnico = profile('Tecnico');
    expect(canAccessRoute(tecnico, '/app/checks')).toBe(true);
    expect(canAccessRoute(tecnico, '/app/checks/check-1')).toBe(true);
    expect(canAccessRoute(tecnico, '/app/avisos')).toBe(true);
  });

  it('bloquea superadmin y zonas globales a tecnico puro', () => {
    const tecnico = profile('Tecnico');
    expect(canAccessRoute(tecnico, '/app/superadmin')).toBe(false);
    expect(canAccessRoute(tecnico, '/app/clientes')).toBe(false);
    expect(canAccessRoute(tecnico, '/app/partes')).toBe(false);
  });

  it('permite rutas superadmin solo a superadmin', () => {
    const owner = profile('superadmin');
    expect(isSuperadmin(owner)).toBe(true);
    expect(canAccessRoute(owner, '/app/superadmin')).toBe(true);
    expect(canAccessRoute(owner, '/app/superadmin/usuarios/nuevo')).toBe(true);
    expect(canAccessRoute(profile('SAT'), '/app/superadmin')).toBe(false);
  });

  it('impide que el tecnico cree avisos globales', () => {
    expect(canCreateAlert(profile('Tecnico'))).toBe(false);
    expect(canCreateAlert(profile('SAT'))).toBe(true);
  });

  it('permite a SAT coordinar operativa sin acceder a superadmin', () => {
    const sat = profile('SAT');
    ['/app/inicio', '/app/clientes', '/app/centros', '/app/equipos', '/app/expedientes', '/app/partes', '/app/checks', '/app/deficiencias', '/app/documentos', '/app/avisos', '/app/plantillas'].forEach((route) => expect(canAccessRoute(sat, route)).toBe(true));
    expect(canAccessRoute(sat, '/app/superadmin')).toBe(false);
    expect(canAccessRoute(sat, '/app/superadmin/usuarios')).toBe(false);
  });

  it('permite rutas SAT cuando primary_area llega incompleto pero roles contiene SAT', () => {
    const satByRole = { ...profile('SAT', ['SAT']), primary_area: null } as any as Profile;
    expect(profileWorkspaces(satByRole)).toEqual(['sat']);
    for (const route of ['/app/clientes', '/app/partes', '/app/partes/90ad219b-f5d0-4489-a834-eac040469be6', '/app/trabajos/90ad219b-f5d0-4489-a834-eac040469be6', '/app/checks', '/app/checks/check-1', '/app/expedientes']) {
      expect(canAccessRoute(satByRole, route)).toBe(true);
    }
  });

  it('mantiene la matriz de gerencia alineada con permisos operativos decididos', () => {
    expect(canRole('Gerencia', 'ver clientes')).toBe(true);
    expect(canRole('Gerencia', 'asignar técnicos')).toBe(true);
    expect(canRole('Gerencia', 'crear clientes')).toBe(false);
    expect(canRole('Gerencia', 'crear checks')).toBe(false);
    expect(canRole('Gerencia', 'ejecutar checks')).toBe(false);
  });

  it('impide edición administrativa de checks a un tecnico puro', () => {
    const tecnico = profile('Tecnico');
    expect(canManageCheck(tecnico)).toBe(false);
    expect(canManageCheck(profile('SAT'))).toBe(true);
    expect(canManageCheck(profile('superadmin'))).toBe(true);
  });

  it('limita checks de tecnico puro a asignaciones propias', () => {
    const tecnico = profile('Tecnico');
    expect(canViewCheck(tecnico, { technician_id: tecnico.id })).toBe(true);
    expect(canViewCheck(tecnico, { technician_id: 'other' })).toBe(false);
  });

  it('limita la gestion de asignaciones a SAT, Gerencia y Superadmin', () => {
    expect(canManageWorkOrderAssignments(profile('SAT'))).toBe(true);
    expect(canManageWorkOrderAssignments(profile('Gerencia'))).toBe(true);
    expect(canManageWorkOrderAssignments(profile('superadmin'))).toBe(true);
    expect(canManageWorkOrderAssignments(profile('Tecnico'))).toBe(false);
    expect(canManageWorkOrderAssignments(profile('Comercial'))).toBe(false);
  });

  it('centraliza archivo restauracion y borrado definitivo en SAT Gerencia y Superadmin activos', () => {
    const entity = { id: 'entity-id', company_id: 'company-id' };
    for (const role of ['SAT', 'Gerencia', 'superadmin'] as RoleName[]) {
      expect(canArchiveEntity(profile(role), entity)).toBe(true);
      expect(canRestoreEntity(profile(role), entity)).toBe(true);
      expect(canPermanentlyDeleteEntity(profile(role), entity)).toBe(true);
    }
    for (const role of ['Tecnico', 'Comercial', 'Oficina'] as RoleName[]) {
      expect(canArchiveEntity(profile(role), entity)).toBe(false);
      expect(canRestoreEntity(profile(role), entity)).toBe(false);
      expect(canPermanentlyDeleteEntity(profile(role), entity)).toBe(false);
    }
    expect(canArchiveEntity({ ...profile('SAT'), active: false }, entity)).toBe(false);
    expect(canArchiveEntity({ ...profile('Gerencia'), deleted_at: '2026-01-01' }, entity)).toBe(false);
    expect(canArchiveEntity(profile('SAT'), { ...entity, company_id: 'other-company' })).toBe(false);
    expect(canArchiveEntity(profile('superadmin'), { ...entity, company_id: 'other-company' })).toBe(false);
    expect(canArchiveEntity(profile('SAT'), { ...entity, lifecycle_entity: 'profiles' })).toBe(false);
    expect(canArchiveEntity(profile('Gerencia'), { ...entity, lifecycle_entity: 'profiles' })).toBe(false);
    expect(canArchiveEntity(profile('superadmin'), { ...entity, lifecycle_entity: 'profiles' })).toBe(true);
    expect(canRestoreEntity(profile('SAT'), { ...entity, lifecycle_entity: 'profiles' })).toBe(false);
    expect(canPermanentlyDeleteEntity(profile('Gerencia'), { ...entity, lifecycle_entity: 'profiles' })).toBe(false);
  });

  it('autoriza al superadmin global solo sobre la empresa seleccionada', () => {
    const selectedEntity = { id: 'entity-id', company_id: 'selected-company' };
    const otherEntity = { id: 'entity-id', company_id: 'other-company' };
    const scope = { platformScope: true, selectedCompanyId: 'selected-company' };
    expect(canArchiveEntity(profile('superadmin'), selectedEntity, scope)).toBe(true);
    expect(canRestoreEntity(profile('superadmin'), selectedEntity, scope)).toBe(true);
    expect(canPermanentlyDeleteEntity(profile('superadmin'), selectedEntity, scope)).toBe(true);
    expect(canArchiveEntity(profile('superadmin'), otherEntity, scope)).toBe(false);
  });

  it('bloquea al superadmin global sin empresa seleccionada', () => {
    const entity = { id: 'entity-id', company_id: 'selected-company' };
    expect(canArchiveEntity(profile('superadmin'), entity, { platformScope: true, selectedCompanyId: null })).toBe(false);
    expect(canPermanentlyDeleteEntity(profile('superadmin'), entity, { platformScope: true, selectedCompanyId: null })).toBe(false);
  });

  it('mantiene SAT y Gerencia limitados a su empresa aunque haya alcance de plataforma', () => {
    const entity = { id: 'entity-id', company_id: 'other-company' };
    const scope = { platformScope: true, selectedCompanyId: 'other-company' };
    expect(canArchiveEntity(profile('SAT'), entity, scope)).toBe(false);
    expect(canArchiveEntity(profile('Gerencia'), entity, scope)).toBe(false);
  });

  it('permite estado directo, horas y materiales a roles operativos autorizados', () => {
    const workOrder = { id: 'work-id', company_id: 'company-id', status: 'En intervencion', origin: 'SAT', assignments: [{ technician_id: 'Tecnico-id' }] };
    for (const role of ['superadmin', 'SAT', 'Gerencia'] as RoleName[]) {
      expect(canManageWorkOrderStatus(profile(role), workOrder)).toBe(true);
      expect(canManageWorkOrderTime(profile(role), workOrder)).toBe(true);
      expect(canManageWorkOrderMaterials(profile(role), workOrder)).toBe(true);
      expect(canViewWorkOrderCosts(profile(role))).toBe(true);
    }
    expect(canManageWorkOrderStatus(profile('Tecnico'), workOrder)).toBe(true);
    expect(canManageWorkOrderTime(profile('Tecnico'), workOrder, { profile_id: 'Tecnico-id' })).toBe(true);
    expect(canManageWorkOrderMaterials(profile('Tecnico'), workOrder, { registered_by: 'Tecnico-id' })).toBe(true);
    expect(canViewWorkOrderCosts(profile('Tecnico'))).toBe(false);
  });

  it('bloquea horas y materiales a tecnicos no asignados o con asignacion historica', () => {
    const assigned = { id: 'work-id', company_id: 'company-id', status: 'En intervencion', assignments: [{ technician_id: 'Tecnico-id', status: 'Asignado' }] };
    const unassigned = { ...assigned, assignments: [{ technician_id: 'other-id', status: 'Asignado' }] };
    const historical = { ...assigned, assignments: [{ technician_id: 'Tecnico-id', status: 'Finalizado' }] };

    expect(canManageWorkOrderTime(profile('Tecnico'), assigned)).toBe(true);
    expect(canManageWorkOrderTime(profile('Tecnico'), assigned, { profile_id: 'other-id', created_by: 'Tecnico-id' })).toBe(true);
    expect(canManageWorkOrderMaterials(profile('Tecnico'), assigned)).toBe(true);
    expect(canManageWorkOrderTime(profile('Tecnico'), unassigned)).toBe(false);
    expect(canManageWorkOrderMaterials(profile('Tecnico'), unassigned)).toBe(false);
    expect(canManageWorkOrderTime(profile('Tecnico'), historical)).toBe(false);
    expect(canManageWorkOrderMaterials(profile('Tecnico'), historical)).toBe(false);
  });

  it('bloquea Comercial fuera de empresa y roles no operativos para horas/materiales', () => {
    const commercialWork = { id: 'work-id', company_id: 'company-id', status: 'Pendiente', origin: 'Comercial', created_by: 'Comercial-id' };
    const responsibleCommercialWork = { ...commercialWork, created_by: 'other', current_responsible_id: 'Comercial-id' };
    const otherCompany = { ...commercialWork, company_id: 'other-company' };
    const satWork = { ...commercialWork, origin: 'SAT' };
    const otherCommercialWork = { ...commercialWork, created_by: 'other', current_responsible_id: 'other' };
    expect(canManageWorkOrderStatus(profile('Comercial'), commercialWork)).toBe(true);
    expect(canManageWorkOrderTime(profile('Comercial'), commercialWork)).toBe(true);
    expect(canManageWorkOrderMaterials(profile('Comercial'), commercialWork)).toBe(true);
    expect(canManageWorkOrderStatus(profile('Comercial'), responsibleCommercialWork)).toBe(true);
    expect(canManageWorkOrderTime(profile('Comercial'), responsibleCommercialWork)).toBe(true);
    expect(canManageWorkOrderMaterials(profile('Comercial'), responsibleCommercialWork)).toBe(true);
    expect(canManageWorkOrderTime(profile('Comercial'), commercialWork, { profile_id: 'other' })).toBe(false);
    expect(canManageWorkOrderMaterials(profile('Comercial'), commercialWork, { registered_by: 'other' })).toBe(false);
    expect(canManageWorkOrderStatus(profile('Comercial'), satWork)).toBe(false);
    expect(canManageWorkOrderTime(profile('Comercial'), satWork)).toBe(false);
    expect(canManageWorkOrderMaterials(profile('Comercial'), satWork)).toBe(false);
    expect(canManageWorkOrderStatus(profile('Comercial'), otherCommercialWork)).toBe(false);
    expect(canManageWorkOrderTime(profile('Comercial'), otherCommercialWork)).toBe(false);
    expect(canManageWorkOrderMaterials(profile('Comercial'), otherCommercialWork)).toBe(false);
    expect(canManageWorkOrderStatus(profile('Comercial'), otherCompany)).toBe(false);
    expect(canManageWorkOrderTime(profile('Comercial'), otherCompany)).toBe(false);
    expect(canManageWorkOrderMaterials(profile('Oficina'), commercialWork)).toBe(false);
  });
});
