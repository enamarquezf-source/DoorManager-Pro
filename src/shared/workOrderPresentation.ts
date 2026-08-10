type NamedProfile = { first_name?: string | null; last_name?: string | null } | null | undefined;
type PresentationRecord = Record<string, unknown>;

export type ActivityEvent = {
  type: 'Estado' | 'Nota' | 'Material' | 'Hora' | 'Foto' | 'Firma' | 'Check' | 'Deficiencia';
  date: string;
  author: string | null;
  title: string;
  text: string | null;
};

export function interventionSummary(workOrder: PresentationRecord | null | undefined) {
  const notes = asRows(workOrder?.notes ?? workOrder?.work_order_notes);
  const text = notes.map((note) => textValue(note.note ?? note.content ?? note.description) ?? '').join('\n');
  const pick = (label: string) => Array.from(text.matchAll(new RegExp(`${label}:\\s*([^\\n]+)`, 'gi'))).at(-1)?.[1]?.trim() ?? null;
  return {
    diagnosis: textValue(workOrder?.diagnosis) ?? pick('Diagnóstico'),
    work: textValue(workOrder?.work_performed) ?? pick('Trabajo realizado'),
    observations: textValue(workOrder?.observations) ?? pick('Observaciones'),
    result: textValue(workOrder?.result) ?? pick('Resultado') ?? pick('Solución') ?? textValue(workOrder?.status),
    syncedAt: latestDate([...notes, ...asRows(workOrder?.materials), ...asRows(workOrder?.photos), ...asRows(workOrder?.signatures)]),
  };
}

export function activityTimeline(workOrder: PresentationRecord | null | undefined): ActivityEvent[] {
  const events = [
    ...asRows(workOrder?.status_history).map((item) => event('Estado', item.changed_at, profileValue(item.profiles), `${textValue(item.previous_status) ?? 'Creado'} -> ${textValue(item.new_status) ?? 'Sin estado'}`, item.reason)),
    ...asRows(workOrder?.notes ?? workOrder?.work_order_notes).map((item) => event('Nota', item.created_at, profileValue(item.profiles), 'Intervención', item.note ?? item.content ?? item.description)),
    ...asRows(workOrder?.materials).map((item) => { const material = recordValue(item.materials); return event('Material', item.created_at, profileValue(item.profiles), material?.name ?? material?.description ?? item.description ?? 'Material usado', `${textValue(item.used_quantity ?? item.quantity) ?? '1'} ${textValue(item.unit) ?? ''}`.trim()); }),
    ...asRows(workOrder?.time_entries ?? workOrder?.work_order_time_entries).map((item) => event('Hora', item.updated_at ?? item.created_at, profileValue(item.profiles), `${textValue(item.duration_minutes) ?? '0'} min · ${textValue(item.hour_type) ?? 'normal'}`, item.description)),
    ...asRows(workOrder?.photos).map((item) => { const file = recordValue(item.files); return event('Foto', item.taken_at ?? item.created_at, profileValue(item.profiles), item.name ?? file?.name ?? 'Foto', item.description); }),
    ...asRows(workOrder?.signatures).map((item) => event('Firma', item.signed_at ?? item.created_at, profileValue(item.profiles), item.signer_name ?? 'Firma', item.signer_role)),
    ...asRows(workOrder?.checks).map((item) => event('Check', item.finished_at ?? item.created_at, profileValue(item.profiles), item.code ?? 'Check', item.global_result ?? item.status)),
    ...asRows(workOrder?.deficiencies).map((item) => event('Deficiencia', item.created_at, profileValue(item.profiles), item.code ?? item.severity ?? 'Deficiencia', item.description)),
  ];
  return events.filter((item): item is ActivityEvent => Boolean(item)).sort((a, b) => b.date.localeCompare(a.date));
}

function event(type: ActivityEvent['type'], rawDate: unknown, profile: NamedProfile, rawTitle: unknown, rawText: unknown): ActivityEvent | null {
  const date = typeof rawDate === 'string' && rawDate.trim() ? rawDate : null;
  if (!date) return null;
  const author = profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || null : null;
  const title = textValue(rawTitle) ?? type;
  const text = textValue(rawText);
  return { type, date, author, title, text };
}

function asRows(value: unknown): PresentationRecord[] {
  return Array.isArray(value) ? value.filter((item): item is PresentationRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
}

function recordValue(value: unknown): PresentationRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as PresentationRecord : null;
}

function profileValue(value: unknown): NamedProfile {
  const profile = recordValue(value);
  if (!profile) return null;
  return { first_name: textValue(profile.first_name), last_name: textValue(profile.last_name) };
}

function textValue(value: unknown) {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function latestDate(rows: PresentationRecord[]) {
  return rows.map((item) => item.synced_at ?? item.updated_at ?? item.created_at ?? item.taken_at ?? item.signed_at).filter(Boolean).sort().at(-1) ?? null;
}

export function maskDocument(value?: string | null) {
  if (!value) return '-';
  return value.length <= 4 ? '****' : `${value.slice(0, 2)}****${value.slice(-2)}`;
}
