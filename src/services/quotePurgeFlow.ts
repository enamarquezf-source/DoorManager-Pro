export function quotePurgeCanShowButton(quote: any, workspace: string) {
  return Boolean(quote?.deleted_at && workspace === 'superadmin');
}

export function quotePurgeExpectedConfirmation(code: string) {
  return `ELIMINAR ${code}`;
}

export type QuotePurgeBlocks = {
  generatedWorkOrders: number;
  deficiencies: number;
  hardBlock: boolean;
  requiresWorkOrderDecision: boolean;
};

export function quotePurgeBlocks(plan: any): QuotePurgeBlocks {
  const blocking = plan?.blocking_dependencies ?? {};
  const generatedWorkOrders = Number(blocking.partes_generados ?? 0);
  const deficiencies = Number(blocking.deficiencias ?? 0);
  return {
    generatedWorkOrders,
    deficiencies,
    hardBlock: deficiencies > 0,
    requiresWorkOrderDecision: generatedWorkOrders > 0,
  };
}

export function quotePurgeScope(purgeWorkOrders: boolean) {
  return purgeWorkOrders ? { purge_related_work_orders: true } : {};
}

export type QuotePurgeScopeKey = 'baseline' | 'include_work_orders';

export function quotePurgeScopeKey(purgeWorkOrders: boolean): QuotePurgeScopeKey {
  return purgeWorkOrders ? 'include_work_orders' : 'baseline';
}

export function quotePurgePlanMatchesScope(planScopeKey: QuotePurgeScopeKey | null, purgeWorkOrders: boolean) {
  return planScopeKey != null && planScopeKey === quotePurgeScopeKey(purgeWorkOrders);
}

export function quotePurgeResultOk(result: any) {
  return result?.operation === 'purged' || result?.operation === 'already_deleted';
}
