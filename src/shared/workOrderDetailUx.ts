import { isOpenDeficiencyStatus } from './filters';

export function workOrderOperationalMetrics(workOrder: any) {
  const hours = Array.isArray(workOrder?.time_entries) ? workOrder.time_entries : [];
  const materials = Array.isArray(workOrder?.materials) ? workOrder.materials : [];
  const costs = Array.isArray(workOrder?.cost_entries ?? workOrder?.work_order_cost_entries)
    ? (workOrder.cost_entries ?? workOrder.work_order_cost_entries)
    : [];
  const checks = Array.isArray(workOrder?.checks) ? workOrder.checks : [];
  const deficiencies = Array.isArray(workOrder?.deficiencies) ? workOrder.deficiencies : [];
  const photos = Array.isArray(workOrder?.photos) ? workOrder.photos : [];
  const signatures = Array.isArray(workOrder?.signatures) ? workOrder.signatures : [];
  const documents = Array.isArray(workOrder?.documents) ? workOrder.documents : [];

  return {
    totalMinutes: hours.reduce((sum: number, row: any) => sum + Number(row.duration_minutes ?? 0), 0),
    materials: materials.length,
    costs: costs.length,
    checksComplete: checks.filter((check: any) => check.status === 'Realizado' || check.finished_at).length,
    checksTotal: checks.length,
    openDeficiencies: deficiencies.filter((item: any) => isOpenDeficiencyStatus(item.status)).length,
    photos: photos.length,
    signatures: signatures.length,
    documents: documents.length,
    closure: workOrder?.finished_at ? 'Finalizado' : 'Pendiente',
  };
}

export function workOrderDetailWarnings(workOrder: any) {
  const metrics = workOrderOperationalMetrics(workOrder);
  const warnings: string[] = [];
  if (metrics.checksTotal > metrics.checksComplete) warnings.push(`${metrics.checksTotal - metrics.checksComplete} check pendiente${metrics.checksTotal - metrics.checksComplete === 1 ? '' : 's'}`);
  if (metrics.totalMinutes === 0) warnings.push('Sin horas registradas');
  if (metrics.materials === 0) warnings.push('Sin materiales registrados');
  if (metrics.openDeficiencies > 0) warnings.push(`${metrics.openDeficiencies} deficiencia${metrics.openDeficiencies === 1 ? '' : 's'} abierta${metrics.openDeficiencies === 1 ? '' : 's'}`);
  if (metrics.photos === 0) warnings.push('Sin fotos registradas');
  if (metrics.signatures === 0) warnings.push('No hay firma registrada');
  if (!String(workOrder?.diagnosis ?? '').trim() || !String(workOrder?.work_performed ?? '').trim() || !String(workOrder?.result ?? '').trim()) warnings.push('Información operativa incompleta');
  return warnings;
}

export function workOrderWarningTone(warning: string) {
  if (warning.includes('deficiencia')) return 'important' as const;
  if (warning.includes('check pendiente')) return 'attention' as const;
  return 'neutral' as const;
}

export function workOrderCheckAction(workOrder: any, canCreate: boolean) {
  const checks = Array.isArray(workOrder?.checks) ? workOrder.checks : [];
  if (checks.length > 0) return 'Abrir check' as const;
  return canCreate ? 'Crear check' as const : null;
}
