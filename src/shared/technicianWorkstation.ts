export type WorkstationProgress = {
  work: 'complete' | 'pending';
  materials: 'complete' | 'empty' | 'pending';
  hours: 'complete' | 'empty';
  travel: 'complete' | 'empty' | 'pending';
  checks: { done: number; total: number };
  photos: number;
  signature: 'complete' | 'pending';
};

export function technicianProgress(workOrder: any): WorkstationProgress {
  const work = String(workOrder?.work_performed ?? '').trim();
  const materials = workOrder?.materials ?? [];
  const hours = workOrder?.time_entries ?? [];
  const travel = (workOrder?.planned_quote_lines ?? []).filter((line: any) => ['transport', 'travel'].includes(line.line_type));
  const checks = (workOrder?.checks ?? []).filter((check: any) => !check.deleted_at);
  return {
    work: work ? 'complete' : 'pending',
    materials: materials.length ? 'complete' : 'empty',
    hours: hours.length ? 'complete' : 'empty',
    travel: travel.length ? 'complete' : 'empty',
    checks: { done: checks.filter((check: any) => check.status === 'Realizado').length, total: checks.length },
    photos: (workOrder?.photos ?? []).length,
    signature: (workOrder?.signatures ?? []).length ? 'complete' : 'pending',
  };
}

export function technicianConceptLines(workOrder: any) {
  return (workOrder?.planned_quote_lines ?? []).filter((line: any) => !['fee', 'discount'].includes(line.line_type));
}
