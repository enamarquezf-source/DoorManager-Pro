import { supabase } from '../lib/supabase/client';
import { expectData } from './query';

export type LifecycleEntity = 'clients' | 'sites' | 'equipment' | 'equipment_components' | 'cases' | 'work_orders' | 'checks' | 'check_templates' | 'profiles' | 'quotes' | 'materials' | 'documents' | 'alerts' | 'opportunities';
export type ArchiveFilter = 'active' | 'archived' | 'all';

export type LifecycleSummary = {
  entity: LifecycleEntity;
  id: string;
  company_id: string;
  code: string;
  name: string;
  archived: boolean;
  dependencies: Record<string, number>;
  dependency_total: number;
  can_archive: boolean;
  can_restore: boolean;
  restore_blocker: string | null;
  can_permanently_delete: boolean;
  physical_delete_blocker: string | null;
  can_controlled_cascade_delete?: boolean;
  cascade_dependencies?: Record<string, number>;
  blocking_dependencies?: Record<string, number>;
  operation?: string;
};

export const entityLabels: Record<LifecycleEntity, string> = {
  clients: 'cliente',
  sites: 'centro',
  equipment: 'equipo',
  equipment_components: 'componente',
  cases: 'expediente',
  work_orders: 'parte',
  checks: 'check',
  check_templates: 'plantilla',
  profiles: 'usuario',
  quotes: 'presupuesto',
  materials: 'material',
  documents: 'documento',
  alerts: 'aviso',
  opportunities: 'oportunidad',
};

export const STANDARD_PURGE_REASON = 'Eliminación definitiva solicitada por superadmin';

export const entityLifecycleService = {
  dependencies(entity: LifecycleEntity, id: string) {
    return expectData<LifecycleSummary>(supabase.rpc('dmp_lifecycle_dependencies_enhanced', { p_entity: entity, p_entity_id: id }));
  },
  archive(entity: LifecycleEntity, id: string, reason: string) {
    return expectData<LifecycleSummary>(supabase.rpc('dmp_archive_entity', { p_entity: entity, p_entity_id: id, p_reason: reason }));
  },
  restore(entity: LifecycleEntity, id: string, reason: string) {
    return expectData<LifecycleSummary>(supabase.rpc('dmp_restore_entity', { p_entity: entity, p_entity_id: id, p_reason: reason }));
  },
  permanentlyDelete(entity: LifecycleEntity, id: string, reason: string, confirmation: string) {
    return expectData<LifecycleSummary>(supabase.rpc('dmp_permanently_delete_entity', { p_entity: entity, p_entity_id: id, p_reason: reason, p_confirmation: confirmation }));
  },
  purge(entity: LifecycleEntity, id: string, opts: { reason?: string; confirmation: string; scope: Record<string, any>; dryRun: boolean }) {
    const p_reason = (opts.reason ?? STANDARD_PURGE_REASON).trim() || STANDARD_PURGE_REASON;
    const p_confirmation = opts.confirmation;
    const p_scope = opts.scope ?? {};
    console.debug(`[purge] dmp_purge_entity_with_cleanup entity=${entity} id=${id} dry_run=${opts.dryRun} reason=${p_reason} confirmation=${p_confirmation} scope=${JSON.stringify(p_scope)} return_stock=true`);
    return expectData<any>(supabase.rpc('dmp_purge_entity_with_cleanup', {
      p_entity: entity,
      p_entity_id: id,
      p_reason,
      p_confirmation,
      p_scope,
      p_return_stock: true,
      p_dry_run: opts.dryRun,
    }));
  },
};

export function applyArchiveFilter(query: any, filter: ArchiveFilter, activeColumn?: 'active') {
  if (filter === 'archived') return activeColumn ? query.eq(activeColumn, false) : query.not('deleted_at', 'is', null);
  if (filter === 'all') return query;
  return activeColumn ? query.eq(activeColumn, true) : query.is('deleted_at', null);
}

export function isArchivedRecord(entity: LifecycleEntity, record: any) {
  if (entity === 'check_templates') return record?.active === false;
  return !!record?.deleted_at || record?.active === false;
}
