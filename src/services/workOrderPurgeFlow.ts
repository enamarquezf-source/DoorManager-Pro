export function workOrderPurgeCanShowButton(workOrder: any, workspace: string) {
  return Boolean(workOrder?.deleted_at && workspace === 'superadmin');
}

export function workOrderPurgeExpectedConfirmation(code: string) {
  return `ELIMINAR ${code}`;
}

export type WorkOrderPurgeScopeKey = 'baseline' | 'include_documents' | 'include_stock_movements' | 'include_documents_and_stock_movements';

export type WorkOrderPurgeBlocks = {
  documents: number;
  stockMovements: number;
  externalDeficiencies: number;
  unclassifiedDeficiencyReferences: number;
  hardBlock: boolean;
};

export function workOrderPurgeBlocks(plan: any): WorkOrderPurgeBlocks {
  const blocking = plan?.blocking_dependencies ?? {};
  const documents = Number(blocking.documentos_enlazados ?? 0);
  const stockMovements = Number(blocking.movimientos_stock ?? 0);
  const externalDeficiencies = Number(blocking.deficiencias_externas ?? 0);
  const unclassifiedDeficiencyReferences = Number(blocking.referencias_deficiencias_no_clasificadas ?? 0);
  return {
    documents,
    stockMovements,
    externalDeficiencies,
    unclassifiedDeficiencyReferences,
    hardBlock: externalDeficiencies > 0 || unclassifiedDeficiencyReferences > 0,
  };
}

export function workOrderPurgeScope(includeDocuments: boolean, includeStockMovements: boolean): Record<string, string> {
  const scope: Record<string, string> = {};
  if (includeDocuments) scope.documents = 'purge';
  if (includeStockMovements) scope.stock_movements = 'purge';
  return scope;
}

export function workOrderPurgeScopeKey(includeDocuments: boolean, includeStockMovements: boolean): WorkOrderPurgeScopeKey {
  if (includeDocuments && includeStockMovements) return 'include_documents_and_stock_movements';
  if (includeDocuments) return 'include_documents';
  if (includeStockMovements) return 'include_stock_movements';
  return 'baseline';
}

export function workOrderPurgePlanMatchesScope(planScopeKey: WorkOrderPurgeScopeKey | null, includeDocuments: boolean, includeStockMovements: boolean) {
  return planScopeKey != null && planScopeKey === workOrderPurgeScopeKey(includeDocuments, includeStockMovements);
}

export function workOrderPurgeResultOk(result: any) {
  return result?.operation === 'purged' || result?.operation === 'already_deleted';
}

const cascadeLabels: Record<string, string> = {
  equipos_adicionales: 'Equipos adicionales',
  asignaciones: 'Asignaciones',
  historial_estados: 'Historial de estados',
  notas: 'Notas',
  horas: 'Horas',
  materiales: 'Materiales',
  recursos_costes: 'Recursos y costes',
  decisiones_materiales_previstos: 'Decisiones de materiales previstos',
  decisiones_conceptos_previstos: 'Decisiones de conceptos previstos',
  fotos: 'Fotos',
  firmas: 'Firmas',
  checks: 'Checks',
  deficiencias_propias: 'Deficiencias propias',
  acciones_correctivas: 'Acciones correctivas',
  avisos: 'Avisos',
  solicitudes_material: 'Solicitudes de material',
  presupuestos_vinculados: 'Presupuestos vinculados',
  movimientos_stock_nuevos: 'Movimientos de stock',
};

export function workOrderPurgePlanItems(plan: any): [string, string][] {
  const cascade = plan?.cascade_dependencies ?? {};
  return Object.entries(cascade)
    .filter(([key]) => cascadeLabels[key] != null)
    .map(([key, count]) => [cascadeLabels[key], String(count)]);
}