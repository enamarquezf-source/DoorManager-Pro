import type { LifecycleEntity } from './entityLifecycleService';

export type PurgeScopeKey = 'purge_related_work_orders' | 'documents' | 'stock_movements';

export type EntityPurgeDecision = {
  blockerKey: string;
  scopeKey: PurgeScopeKey;
  label: (count: number) => string;
};

export type EntityPurgeConfig = {
  entity: LifecycleEntity;
  label: string;
  modalTitle: string;
  decisions: EntityPurgeDecision[];
  informationalKeys?: string[];
};

export type EntityPurgeBlockers = {
  decisions: { config: EntityPurgeDecision; count: number }[];
  hard: { key: string; count: number }[];
  informational: { key: string; count: number }[];
};

export function entityPurgeCanShowButton(entity: LifecycleEntity, record: any, workspace: string) {
  return Boolean(record?.deleted_at && workspace === 'superadmin');
}

export function entityPurgeExpectedConfirmation(code: string) {
  return `ELIMINAR ${code}`;
}

export function entityPurgeBlockers(config: EntityPurgeConfig, plan: any): EntityPurgeBlockers {
  const blocking = plan?.blocking_dependencies ?? {};
  const known = new Set(config.decisions.map((d) => d.blockerKey));
  const informationalKeys = new Set(config.informationalKeys ?? []);
  const decisions = config.decisions
    .map((d) => ({ config: d, count: Number(blocking[d.blockerKey] ?? 0) }))
    .filter((item) => item.count > 0);
  const informational = Object.entries(blocking)
    .filter(([key, value]) => Number(value) > 0 && informationalKeys.has(key))
    .map(([key, value]) => ({ key, count: Number(value) }));
  const hard = Object.entries(blocking)
    .filter(([key, value]) => Number(value) > 0 && !known.has(key) && !informationalKeys.has(key))
    .map(([key, value]) => ({ key, count: Number(value) }));
  return { decisions, hard, informational };
}

export function entityPurgeScopeKey(enabledScopeKeys: PurgeScopeKey[]) {
  const sorted = [...enabledScopeKeys].sort();
  return sorted.length ? sorted.join('+') : 'baseline';
}

export function entityPurgeScope(config: EntityPurgeConfig, enabledScopeKeys: PurgeScopeKey[]) {
  const scope: Record<string, any> = {};
  for (const decision of config.decisions) {
    if (enabledScopeKeys.includes(decision.scopeKey)) {
      if (decision.scopeKey === 'documents' || decision.scopeKey === 'stock_movements') scope[decision.scopeKey] = 'purge';
      else scope[decision.scopeKey] = true;
    }
  }
  return scope;
}

export function entityPurgePlanMatchesScope(planScopeKey: string | null, enabledScopeKeys: PurgeScopeKey[]) {
  return planScopeKey != null && planScopeKey === entityPurgeScopeKey(enabledScopeKeys);
}

export function entityPurgeResultOk(result: any) {
  return result?.operation === 'purged' || result?.operation === 'already_deleted';
}

export const equipmentPurgeConfig: EntityPurgeConfig = {
  entity: 'equipment',
  label: 'equipo',
  modalTitle: 'Eliminar definitivamente el equipo',
  decisions: [
    { blockerKey: 'partes_activos', scopeKey: 'purge_related_work_orders', label: (count) => `Purgar también los ${count} partes activos asociados` },
    { blockerKey: 'documentos', scopeKey: 'documents', label: (count) => `Eliminar también los ${count} documentos vinculados` },
  ],
  informationalKeys: ['presupuestos'],
};

export const casesPurgeConfig: EntityPurgeConfig = {
  entity: 'cases',
  label: 'expediente',
  modalTitle: 'Eliminar definitivamente el expediente',
  decisions: [
    { blockerKey: 'partes', scopeKey: 'purge_related_work_orders', label: (count) => `Purgar también los ${count} partes asociados` },
  ],
};

export const checksPurgeConfig: EntityPurgeConfig = {
  entity: 'checks',
  label: 'check',
  modalTitle: 'Eliminar definitivamente el check',
  decisions: [],
};

export function entityPurgeConfigFor(entity: LifecycleEntity): EntityPurgeConfig | null {
  if (entity === 'equipment') return equipmentPurgeConfig;
  if (entity === 'cases') return casesPurgeConfig;
  if (entity === 'checks') return checksPurgeConfig;
  return null;
}