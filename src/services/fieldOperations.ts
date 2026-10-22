import { technicianOfflineService } from './technicianOfflineService';
import type { OfflineChange } from './technicianOfflineService';
import type { Profile } from '../shared/types';

export async function saveFieldOperation(type: 'planned-material' | 'concept-decision' | 'time' | 'cost' | 'material-entry' | 'work-fields' | 'check-finish' | 'work-finish', workOrderId: string, values: Record<string, any>, checkId?: string) {
  return technicianOfflineService.upsert({ type, workOrderId, checkId, payload: { ...values, localChangeId: crypto.randomUUID() } });
}

export function overlayFieldWork(work: any, changes: OfflineChange[], profile: Profile | null, savedAt: string) {
  const result = structuredClone(work);
  const rows = changes.filter(item => item.workOrderId === work.id && (item.status !== 'synced' || (item.updatedAt ?? item.createdAt) > savedAt)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const item of rows) {
    const payload = item.payload;
    const row = { ...payload, id: payload.id || item.id, _local: true, profiles: profile, registered_by: profile?.id, created_at: item.createdAt, work_order_id: work.id };
    const update = (key: string, entry: any) => { result[key] = [...(result[key] ?? []).filter((existing: any) => existing.id !== entry.id), entry]; };
    if (item.type === 'concept-decision') { result.planned_quote_line_decisions = [...(result.planned_quote_line_decisions ?? []).filter((entry: any) => entry.quote_line_id !== payload.quote_line_id), row]; result.work_order_quote_line_decisions = result.planned_quote_line_decisions; }
    if (item.type === 'work-fields') Object.assign(result, { work_performed: payload.work_performed });
    if (item.type === 'time') {
      const duration = payload.started_at && payload.ended_at ? Math.max(0, (Date.parse(`2000-01-01T${payload.ended_at}`) - Date.parse(`2000-01-01T${payload.started_at}`)) / 60000 - Number(payload.break_minutes ?? 0)) : Number(payload.duration_minutes);
      update('time_entries', { ...row, duration_minutes: duration });
    }
    if (item.type === 'planned-material') { result.planned_material_decisions = [...(result.planned_material_decisions ?? []).filter((entry: any) => entry.quote_line_id !== payload.quote_line_id), row]; result.work_order_planned_material_decisions = result.planned_material_decisions; if (payload.decision === 'utilizado') update('materials', { ...row, used_quantity: payload.quantity }); }
    if (item.type === 'cost') update('cost_entries', row);
    if (item.type === 'material-entry') update('materials', { ...row, used_quantity: payload.quantity });
    if (item.type === 'photo' && !item.checkId) update('photos', { ...row, signed_url: payload.dataUrl });
    if (item.type === 'signature') update('signatures', { ...row, signed_url: payload.dataUrl, signer_name: payload.signerName ?? payload.signer_name, accepted_terms: true });
    if (item.type === 'check-finish') result.checks = (result.checks ?? []).map((check: any) => check.id === item.checkId ? { ...check, status: 'Realizado', _local: true } : check);
    if (item.type === 'work-finish') { result._finishPending = item.status !== 'synced'; if (item.status === 'synced') result.status = 'Finalizado tecnicamente'; }
  }
  return result;
}

export function overlayFieldCheck(check: any, changes: OfflineChange[], savedAt: string) {
  const result = structuredClone(check);
  for (const item of changes.filter(item => item.checkId === check.id && (item.status !== 'synced' || item.updatedAt > savedAt))) {
    if (item.type === 'check-block') {
      const payload = item.payload;
      const sectionId = item.sectionId ?? payload.sectionId;
      result.check_section_results = [...(result.check_section_results ?? []).filter((row: any) => row.section_id !== sectionId), {
        section_id: sectionId, result: payload.persistedStatus, observations: payload.observations, intervention: payload.intervention,
        severity: payload.severity, affected_item_ids: payload.selectedItemIds, favorable_item_ids: payload.favorableItemIds,
        components: payload.components, updated_at: payload.expectedSectionUpdatedAt, _local: true,
      }];
      const ids = new Set((payload.items ?? []).map((row: any) => row.id));
      result.check_item_results = [...(result.check_item_results ?? []).filter((row: any) => !ids.has(row.item_id)), ...(payload.items ?? []).map((row: any) => ({ ...row, item_id: row.id }))];
    }
    if (item.type === 'check-finish') result.status = 'Realizado';
    if (item.type === 'photo') {
      result.check_photos = [...(result.check_photos ?? []).filter((row: any) => row.id !== item.id), {
        id: item.id, signed_url: item.payload.dataUrl, description: item.payload.description,
        item_result_id: item.payload.itemId, files: { metadata: { section_id: item.sectionId ?? item.payload.sectionId, item_id: item.payload.itemId } },
      }];
    }
  }
  return result;
}
