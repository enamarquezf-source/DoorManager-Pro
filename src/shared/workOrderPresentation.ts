export function interventionSummary(workOrder: any) {
  const notes = workOrder?.notes ?? workOrder?.work_order_notes ?? [];
  const text = notes.map((note: any) => note.note ?? note.content ?? note.description ?? '').join('\n');
  const pick = (label: string) => text.match(new RegExp(`${label}:\\s*([^\\n]+)`, 'i'))?.[1]?.trim() ?? null;
  return {
    diagnosis: workOrder?.diagnosis ?? pick('Diagnóstico'),
    work: workOrder?.work_performed ?? pick('Trabajo realizado'),
    observations: workOrder?.observations ?? pick('Observaciones'),
    result: workOrder?.result ?? workOrder?.status ?? null,
    syncedAt: latestDate([...notes, ...(workOrder?.materials ?? []), ...(workOrder?.photos ?? []), ...(workOrder?.signatures ?? [])]),
  };
}

export function activityTimeline(workOrder: any) {
  const events = [
    ...(workOrder?.status_history ?? []).map((item: any) => ({ type: 'Estado', date: item.changed_at, author: item.profiles ? `${item.profiles.first_name ?? ''} ${item.profiles.last_name ?? ''}`.trim() : null, title: `${item.previous_status ?? 'Creado'} -> ${item.new_status}`, text: item.reason })),
    ...(workOrder?.notes ?? []).map((item: any) => ({ type: 'Nota', date: item.created_at, author: item.profiles ? `${item.profiles.first_name ?? ''} ${item.profiles.last_name ?? ''}`.trim() : null, title: 'Intervención', text: item.note ?? item.content ?? item.description })),
    ...(workOrder?.materials ?? []).map((item: any) => ({ type: 'Material', date: item.created_at, author: item.profiles ? `${item.profiles.first_name ?? ''} ${item.profiles.last_name ?? ''}`.trim() : null, title: item.materials?.name ?? item.description ?? 'Material usado', text: `${item.quantity ?? 1} ${item.unit ?? ''}`.trim() })),
    ...(workOrder?.photos ?? []).map((item: any) => ({ type: 'Foto', date: item.taken_at ?? item.created_at, author: item.profiles ? `${item.profiles.first_name ?? ''} ${item.profiles.last_name ?? ''}`.trim() : null, title: item.name ?? item.files?.name ?? 'Foto', text: item.description })),
    ...(workOrder?.signatures ?? []).map((item: any) => ({ type: 'Firma', date: item.signed_at ?? item.created_at, author: item.profiles ? `${item.profiles.first_name ?? ''} ${item.profiles.last_name ?? ''}`.trim() : null, title: item.signer_name ?? 'Firma', text: item.signer_role })),
    ...(workOrder?.checks ?? []).map((item: any) => ({ type: 'Check', date: item.finished_at ?? item.created_at, author: item.profiles ? `${item.profiles.first_name ?? ''} ${item.profiles.last_name ?? ''}`.trim() : null, title: item.code, text: item.global_result ?? item.status })),
    ...(workOrder?.deficiencies ?? []).map((item: any) => ({ type: 'Deficiencia', date: item.created_at, author: item.profiles ? `${item.profiles.first_name ?? ''} ${item.profiles.last_name ?? ''}`.trim() : null, title: item.code ?? item.severity, text: item.description })),
  ];
  return events.filter((item) => item.date).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function latestDate(rows: any[]) {
  return rows.map((item) => item.synced_at ?? item.updated_at ?? item.created_at ?? item.taken_at ?? item.signed_at).filter(Boolean).sort().at(-1) ?? null;
}

export function maskDocument(value?: string | null) {
  if (!value) return '-';
  return value.length <= 4 ? '****' : `${value.slice(0, 2)}****${value.slice(-2)}`;
}
