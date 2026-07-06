import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, currentProfileId, expectData } from './query';
import type { OfflineChange } from './technicianOfflineService';
import { codesService } from './codesService';

const checkColumns = ['work_order_id', 'equipment_id', 'template_id', 'technician_id', 'status', 'global_result', 'observations'];
function checkPayload(payload: Record<string, any>) {
  return Object.fromEntries(checkColumns.filter((key) => key in payload).map((key) => [key, payload[key] === '' ? null : payload[key]]));
}

function normalize(value?: string | null) {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export const checksService = {
  list(search = '') {
    let query = supabase.from('checks').select('*, equipment!checks_equipment_id_fkey(code), work_orders!checks_work_order_id_fkey(code), profiles!checks_technician_id_fkey(first_name,last_name)').is('deleted_at', null).order('created_at', { ascending: false });
    if (search) query = query.or(contains(['code', 'status', 'global_result', 'observations'], search));
    return expectData<any[]>(query);
  },
  pending() {
    return expectData<any[]>(supabase.from('v_pending_checks').select('*').order('created_at', { ascending: false }));
  },
  async pendingForCurrentTechnician() {
    const profileId = await currentProfileId();
    return expectData<any[]>(supabase.from('v_pending_checks').select('*').eq('technician_id', profileId).order('created_at', { ascending: false }));
  },
  completed() {
    return expectData<any[]>(supabase.from('v_completed_checks').select('*').order('finished_at', { ascending: false }));
  },
  async completedForCurrentTechnician() {
    const profileId = await currentProfileId();
    return expectData<any[]>(supabase.from('v_completed_checks').select('*').eq('technician_id', profileId).order('finished_at', { ascending: false }));
  },
  async get(id: string) {
    const row = await expectData<any>(supabase.from('checks').select('*, equipment!checks_equipment_id_fkey(*), work_orders!checks_work_order_id_fkey(*), check_templates(*, check_template_sections(*, check_template_items(*))), check_section_results(*, check_template_sections(*)), check_item_results(*, check_template_items(*)), check_photos(*)').eq('id', id).maybeSingle());
    if (!row) throw new Error('No se ha encontrado el check solicitado.');
    return row;
  },
  async getTechnicianAssigned(id: string) {
    const profileId = await currentProfileId();
    const check = await expectData<any>(supabase.from('checks').select('id, technician_id, work_order_id').eq('id', id).is('deleted_at', null).maybeSingle());
    if (!check) throw new Error('No tienes permiso para acceder a este trabajo');
    if (check.technician_id === profileId) return this.get(id);
    const assignment = await expectData<any>(supabase.from('work_order_assignments').select('id').eq('work_order_id', check.work_order_id).eq('technician_id', profileId).is('deleted_at', null).maybeSingle());
    if (!assignment) throw new Error('No tienes permiso para acceder a este trabajo');
    return this.get(id);
  },
  templates(equipmentTypeId?: string) {
    let query = supabase.from('check_templates').select('*, check_template_sections(*, check_template_items(*))').eq('active', true);
    if (equipmentTypeId) query = query.eq('equipment_type_id', equipmentTypeId);
    return expectData<any[]>(query.order('name'));
  },
  async create(payload: Record<string, any>) {
    const company_id = await currentCompanyId();
    const technician_id = payload.technician_id || await currentProfileId();
    const code = await codesService.next('checks', 'CHK', true);
    return expectData<any>(supabase.from('checks').insert({ ...checkPayload(payload), company_id, technician_id, code }).select().maybeSingle());
  },
  update(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('checks').update(checkPayload(payload)).eq('id', id).select().maybeSingle());
  },
  async setSectionResult(check_id: string, section_id: string, result: string, observations?: string) {
    const company_id = await currentCompanyId();
    return expectData<any>(supabase.from('check_section_results').upsert({ company_id, check_id, section_id, result, observations: observations || null }, { onConflict: 'check_id,section_id' }).select().single());
  },
  async setItemsResult(check_id: string, sectionResultId: string, items: any[], result: string, observations?: string) {
    if (!items.length) return [];
    const company_id = await currentCompanyId();
    const rows = items.map((item) => ({ company_id, check_id, section_result_id: sectionResultId, item_id: item.id, result, observations: observations || null }));
    return expectData<any[]>(supabase.from('check_item_results').upsert(rows, { onConflict: 'check_id,item_id' }).select());
  },
  async markSectionFavorable(check_id: string, section: any) {
    const sectionResult = await this.setSectionResult(check_id, section.id, 'Todo favorable');
    await this.setItemsResult(check_id, sectionResult.id, section.check_template_items ?? [], 'Todo favorable');
    await supabase.from('checks').update({ status: 'En curso', global_result: 'Todo favorable', started_at: new Date().toISOString() }).eq('id', check_id).is('finished_at', null);
  },
  async finish(check_id: string, global_result: string, observations?: string) {
    const profileId = await currentProfileId();
    return expectData<void>(supabase.rpc('finish_check', { p_check_id: check_id, p_finished_by: profileId, p_global_result: global_result, p_observations: observations || null }));
  },
  async syncOfflineBlock(change: OfflineChange) {
    const payload = change.payload;
    if (!change.checkId) throw new Error('Falta el check asociado. El cambio queda guardado localmente.');
    if (!change.workOrderId) throw new Error('Falta el parte asociado. El cambio queda guardado localmente.');
    if (!change.blockId) throw new Error('Falta el bloque revisado. El cambio queda guardado localmente.');
    if (!payload.persistedStatus || payload.persistedStatus === 'Sin revisar') throw new Error('Falta un estado confirmado válido. El cambio queda guardado localmente.');

    let sectionId = payload.sectionId as string | undefined;
    let items = payload.items ?? [];
    if (!sectionId || String(sectionId).startsWith('local-')) {
      const check = await this.get(change.checkId);
      const sections = check.check_templates?.check_template_sections ?? [];
      const section = sections.find((item: any) => normalize(item.title) === normalize(payload.sectionTitle)) ?? sections.find((item: any) => normalize(item.title).includes(normalize(payload.sectionTitle)) || normalize(payload.sectionTitle).includes(normalize(item.title)));
      if (!section?.id) throw new Error(`No se ha encontrado la sección remota de ${payload.sectionTitle ?? change.blockId}. El cambio queda guardado localmente.`);
      sectionId = section.id;
      items = section.check_template_items ?? items;
    }
    if (!sectionId) throw new Error('Falta la sección remota del bloque. El cambio queda guardado localmente.');

    const sectionResult = await this.setSectionResult(change.checkId, sectionId, payload.persistedStatus, payload.observations);
    await this.setItemsResult(change.checkId, sectionResult.id, items, payload.persistedStatus, payload.observations);
    await expectData<any>(supabase.from('checks').update({ status: 'En curso', global_result: payload.persistedStatus, started_at: new Date().toISOString() }).eq('id', change.checkId).is('finished_at', null).select('id').single());
  },
};
