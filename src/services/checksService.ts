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

export function hasPendingLocalPhotos(payload: Record<string, any>) {
  return Array.isArray(payload.photos) && payload.photos.length > 0;
}

const filesBucket = 'dmp-files';

function dataUrlToBlob(dataUrl: string) {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/data:(.*);base64/)?.[1] ?? 'application/octet-stream';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { blob: new Blob([bytes], { type: mime }), mime };
}

async function uploadLocalFile(path: string, payload: Record<string, any>) {
  if (!payload.dataUrl) throw new Error('Falta el archivo local para sincronizar.');
  const { blob, mime } = dataUrlToBlob(String(payload.dataUrl));
  const { error } = await supabase.storage.from(filesBucket).upload(path, blob, { contentType: payload.type || mime, upsert: true });
  if (error) throw new Error(`No se ha podido subir el archivo a Storage. ${error.message}`);
  return { mime, size: blob.size };
}

export const checksService = {
  async list(search = '', companyScope?: string | null) {
    const companyId = companyScope === undefined ? await currentCompanyId() : companyScope;
    let query = supabase.from('checks').select('*, companies!checks_company_id_fkey(name), equipment!checks_equipment_id_fkey(code), work_orders!checks_work_order_id_fkey(code), profiles!checks_technician_id_fkey(first_name,last_name)').is('deleted_at', null).order('created_at', { ascending: false });
    if (companyId) query = query.eq('company_id', companyId);
    if (search) query = query.or(contains(['code', 'status', 'global_result', 'observations'], search));
    return expectData<any[]>(query);
  },
  async pending(companyScope?: string | null) {
    const companyId = companyScope === undefined ? await currentCompanyId() : companyScope;
    let query = supabase.from('v_pending_checks').select('*').order('created_at', { ascending: false });
    if (companyId) query = query.eq('company_id', companyId);
    return expectData<any[]>(query);
  },
  async pendingForCurrentTechnician() {
    const profileId = await currentProfileId();
    return expectData<any[]>(supabase.from('v_pending_checks').select('*').eq('technician_id', profileId).order('created_at', { ascending: false }));
  },
  async completed(companyScope?: string | null) {
    const companyId = companyScope === undefined ? await currentCompanyId() : companyScope;
    let query = supabase.from('v_completed_checks').select('*').order('finished_at', { ascending: false });
    if (companyId) query = query.eq('company_id', companyId);
    return expectData<any[]>(query);
  },
  async completedForCurrentTechnician() {
    const profileId = await currentProfileId();
    return expectData<any[]>(supabase.from('v_completed_checks').select('*').eq('technician_id', profileId).order('finished_at', { ascending: false }));
  },
  async get(id: string) {
    const row = await expectData<any>(supabase.from('checks').select('*, equipment!checks_equipment_id_fkey(*), work_orders!checks_work_order_id_fkey(*), check_templates!checks_template_id_fkey(*, check_template_sections!check_template_sections_template_id_fkey(*, check_template_items!check_template_items_section_id_fkey(*))), check_section_results!check_section_results_check_id_fkey(*, check_template_sections!check_section_results_section_id_fkey(*)), check_item_results!check_item_results_check_id_fkey(*, check_template_items!check_item_results_item_id_fkey(*)), check_photos!check_photos_check_id_fkey(*)').eq('id', id).maybeSingle());
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
  async templates(equipmentTypeId?: string | null, companyScope?: string | null) {
    const companyId = companyScope === undefined ? await currentCompanyId() : companyScope;
    let query = supabase.from('check_templates').select('*, companies!check_templates_company_id_fkey(name), equipment_types!check_templates_equipment_type_id_fkey(name), check_template_sections!check_template_sections_template_id_fkey(*, check_template_items!check_template_items_section_id_fkey(*))').eq('active', true);
    if (companyId) query = query.or(`company_id.eq.${companyId},company_id.is.null`);
    if (equipmentTypeId) query = query.or(`equipment_type_id.eq.${equipmentTypeId},equipment_type_id.is.null`);
    else query = query.is('equipment_type_id', null);
    return expectData<any[]>(query.order('name'));
  },
  async activeTemplateCount(companyScope?: string | null) {
    const companyId = companyScope === undefined ? await currentCompanyId() : companyScope;
    let query = supabase.from('check_templates').select('id', { count: 'exact', head: true }).eq('active', true);
    if (companyId) query = query.or(`company_id.eq.${companyId},company_id.is.null`);
    const { count, error } = await query;
    if (error) throw new Error('No se han podido consultar las plantillas activas disponibles.');
    return count ?? 0;
  },
  async create(payload: Record<string, any>) {
    const company_id = payload.company_id || await currentCompanyId();
    const technician_id = payload.technician_id || await currentProfileId();
    const code = await codesService.next('checks', 'CHK', true, 6, company_id);
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
    return expectData<string>(supabase.rpc('finish_check_safe', { p_check_id: check_id, p_observations: observations || null }));
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

    return expectData<any>(supabase.rpc('save_check_block_result', { p_payload: { local_change_id: change.id, check_id: change.checkId, section_id: sectionId, result: payload.persistedStatus, observations: payload.observations || null, intervention: payload.intervention || null, severity: payload.severity || null, components: payload.components ?? [], items } }));
  },
  async syncOfflinePhoto(change: OfflineChange) {
    if (!change.checkId) throw new Error('Falta el check asociado a la foto.');
    const companyId = await currentCompanyId();
    if (!companyId) throw new Error('No se ha podido determinar la empresa para subir la foto.');
    const payload = change.payload;
    const localId = payload.id ?? change.id;
    const extension = String(payload.name ?? 'foto.jpg').split('.').pop() || 'jpg';
    const path = `${companyId}/checks/${change.checkId}/${change.blockId ?? 'general'}/${localId}.${extension}`;
    const uploaded = await uploadLocalFile(path, payload);
    try {
      return await expectData<string>(supabase.rpc('register_check_photo', { p_payload: { local_change_id: change.id, check_id: change.checkId, item_result_id: payload.itemResultId ?? null, bucket: filesBucket, path, name: payload.name ?? `Foto ${localId}`, mime_type: payload.type ?? uploaded.mime, size_bytes: payload.size ?? uploaded.size, description: payload.description ?? payload.sectionTitle ?? change.blockId ?? null, metadata: { block_id: change.blockId, section_id: payload.sectionId ?? null } } }));
    } catch (error) {
      await supabase.storage.from(filesBucket).remove([path]);
      throw error;
    }
  },
  async syncOfflineDeficiency(change: OfflineChange) {
    if (!change.checkId) throw new Error('Falta el check asociado a la deficiencia.');
    const payload = change.payload;
    const description = String(payload.description ?? payload.observations ?? '').trim();
    if (!description) throw new Error('Falta la descripción de la deficiencia.');
    return expectData<string>(supabase.rpc('register_check_deficiency', { p_payload: { local_change_id: change.id, check_id: change.checkId, section_id: payload.sectionId ?? null, item_id: payload.itemId ?? null, severity: payload.severity ?? 'Media', description, recommended_action: payload.recommendedAction ?? payload.intervention ?? null } }));
  },
};
