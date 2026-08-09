import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, currentProfileId, expectData, expectStep } from './query';
import { filesBucket, withSignedFileUrl } from '../shared/signedFiles';
import { applyArchiveFilter, type ArchiveFilter } from './entityLifecycleService';

const workOrderColumns = ['case_id', 'client_id', 'site_id', 'main_equipment_id', 'contact_id', 'access_requirement_id', 'title', 'description', 'type', 'priority', 'status', 'origin', 'scheduled_date', 'scheduled_time', 'estimated_duration_minutes', 'planned_material', 'technical_team', 'diagnosis', 'work_performed', 'result'];
function workOrderPayload(payload: Record<string, any>) {
  return Object.fromEntries(workOrderColumns.filter((key) => key in payload).map((key) => [key, payload[key] === '' ? null : payload[key]]));
}

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

export type WorkOrderFullDetail = {
  work_order: any;
  client: any;
  site: any;
  case: any;
  primary_equipment: any;
  additional_equipment: any[];
  assignments: any[];
  primary_technician: any;
  support_technicians: any[];
  status_history: any[];
  time_entries: any[];
  notes: any[];
  materials: any[];
  checks: any[];
  alerts: any[];
  documents: any[];
  deficiencies: any[];
  signatures: any[];
  photos: any[];
};

export const workOrdersService = {
  async list(search = '', companyScope?: string | null, archiveFilter: ArchiveFilter = 'active') {
    const companyId = companyScope === undefined ? await currentCompanyId() : companyScope;
    let query = applyArchiveFilter(supabase.from('v_work_order_full_detail').select('*'), archiveFilter).order('scheduled_date', { ascending: false });
    if (companyId) query = query.eq('company_id', companyId);
    if (search) query = query.or(contains(['code', 'title', 'description', 'client_name', 'site_name', 'equipment_code', 'status'], search));
    return expectData<any[]>(query);
  },
  async listWithAssignments(search = '', companyScope?: string | null, archiveFilter: ArchiveFilter = 'active') {
    const workOrders = await this.list(search, companyScope, archiveFilter);
    const ids = workOrders.map((item) => item.id).filter(Boolean);
    if (!ids.length) return [];
    const [assignments, checks] = await Promise.all([
      expectData<any[]>(supabase.from('work_order_assignments').select('*, profiles!work_order_assignments_technician_id_fkey(first_name,last_name,primary_area)').in('work_order_id', ids).is('deleted_at', null).order('planned_start_time')),
      expectData<any[]>(supabase.from('checks').select('id, code, work_order_id, status, global_result, technician_id, equipment!checks_equipment_id_fkey(code), profiles!checks_technician_id_fkey(first_name,last_name)').in('work_order_id', ids).is('deleted_at', null).order('created_at', { ascending: false })),
    ]);
    return workOrders.map((work) => ({
      ...work,
      assignments: assignments.filter((item) => item.work_order_id === work.id),
      checks: checks.filter((item) => item.work_order_id === work.id),
    }));
  },
  async options(companyScope?: string | null) {
    const companyId = companyScope === undefined ? await currentCompanyId() : companyScope;
    let query = supabase.from('work_orders').select('id, code, title, client_id, site_id, main_equipment_id, status').is('deleted_at', null).order('scheduled_date', { ascending: false });
    if (companyId) query = query.eq('company_id', companyId);
    return expectData<any[]>(query);
  },
  get(id: string) {
    return this.getWorkOrderFullDetail(id);
  },
  async getTechnicianAssigned(id: string) {
    const profileId = await currentProfileId();
    const assignment = await expectData<any>(supabase.from('work_order_assignments').select('id, status, work_orders!work_order_assignments_work_order_id_fkey(status,deleted_at)').eq('work_order_id', id).eq('technician_id', profileId).is('deleted_at', null).not('status', 'in', '(Finalizado,Cancelado)').maybeSingle(), { service: 'workOrdersService', operation: 'Permiso técnico / asignación activa', resource: 'work_order_assignments' });
    if (!assignment) throw new Error('No tienes permiso para acceder a este parte');
    if (!['Pendiente','Trabajo descargado','En desplazamiento','En intervencion','Pausado','Pendiente de material'].includes(assignment.work_orders?.status)) throw new Error('Este parte ya no está en trabajo activo. Revísalo desde Historial.');
    return this.getWorkOrderFullDetail(id);
  },
  async getWorkOrderFullDetail(workOrderId: string): Promise<WorkOrderFullDetail> {
    try {
      const workOrder = await expectData<any>(supabase.from('work_orders').select(`
        *,
        clients!work_orders_client_id_fkey(*),
        sites!work_orders_site_id_fkey(*),
        cases!work_orders_case_id_fkey(*),
        primary_equipment:equipment!work_orders_main_equipment_id_fkey(*, equipment_types!equipment_equipment_type_id_fkey(*)),
        contact:client_contacts!work_orders_contact_id_fkey(*),
        access_requirement:access_requirements!work_orders_access_requirement_id_fkey(*),
        primary_technician:profiles!work_orders_main_technician_id_fkey(*),
        responsible:profiles!work_orders_current_responsible_id_fkey(*, profile_roles!profile_roles_profile_id_fkey(roles!profile_roles_role_id_fkey(name))),
        creator:profiles!work_orders_created_by_fkey(*)
      `).eq('id', workOrderId).maybeSingle());
      if (!workOrder) throw new Error('No se ha encontrado el parte solicitado.');

      const additional = await expectStep('Detalle parte / equipos adicionales', () => expectData<any[]>(supabase.from('work_order_equipment').select('*, equipment!work_order_equipment_equipment_id_fkey(*, equipment_types!equipment_equipment_type_id_fkey(*))').eq('work_order_id', workOrderId).eq('is_primary', false)));
      const assignments = await expectStep('Detalle parte / asignaciones', () => expectData<any[]>(supabase.from('work_order_assignments').select('*, profiles!work_order_assignments_technician_id_fkey(*)').eq('work_order_id', workOrderId).is('deleted_at', null).order('planned_start_time')));
      const history = await expectStep('Detalle parte / historial estados', () => expectData<any[]>(supabase.from('work_order_status_history').select('*, profiles!work_order_status_history_changed_by_fkey(first_name,last_name)').eq('work_order_id', workOrderId).order('changed_at', { ascending: true })));
      const timeEntries = await expectStep('Detalle parte / horas', () => expectData<any[]>(supabase.from('work_order_time_entries').select('*, profiles!work_order_time_entries_profile_id_fkey(first_name,last_name,primary_area)').eq('work_order_id', workOrderId).order('work_date', { ascending: true })));
      const notes = await expectStep('Detalle parte / notas', () => expectData<any[]>(supabase.from('work_order_notes').select('*, profiles!work_order_notes_created_by_fkey(first_name,last_name)').eq('work_order_id', workOrderId).order('created_at', { ascending: true })));
      const materials = await expectStep('Detalle parte / materiales', () => expectData<any[]>(supabase.from('work_order_materials').select('*, materials!work_order_materials_material_id_fkey(*), profiles!work_order_materials_registered_by_fkey(first_name,last_name,primary_area)').eq('work_order_id', workOrderId).order('created_at', { ascending: true })));
      const checks = await expectStep('Detalle parte / checks', () => expectData<any[]>(supabase.from('checks').select('*, check_templates!checks_template_id_fkey(*, check_template_sections!check_template_sections_template_id_fkey(*, check_template_items!check_template_items_section_id_fkey(*))), equipment!checks_equipment_id_fkey(*, equipment_types!equipment_equipment_type_id_fkey(*)), profiles!checks_technician_id_fkey(first_name,last_name), check_section_results!check_section_results_check_id_fkey(*), check_photos!check_photos_check_id_fkey(*)').eq('work_order_id', workOrderId).is('deleted_at', null).order('created_at', { ascending: false })));
      const deficiencies = await expectStep('Detalle parte / deficiencias', () => expectData<any[]>(supabase.from('deficiencies').select('*, equipment!deficiencies_equipment_id_fkey(*), checks!deficiencies_check_id_fkey(code), profiles!deficiencies_responsible_profile_id_fkey(first_name,last_name)').eq('work_order_id', workOrderId).is('deleted_at', null).order('created_at', { ascending: false })));
      const alertRows = await expectStep('Detalle parte / avisos', () => expectData<any[]>(supabase.from('alerts').select('*, alert_recipients!alert_recipients_alert_id_fkey(*)').eq('related_entity', 'work_orders').eq('related_id', workOrderId).is('deleted_at', null).order('created_at', { ascending: false })));
      const documents = await expectStep('Detalle parte / documentos', () => expectData<any[]>(supabase.from('document_links').select('*, documents!document_links_document_id_fkey(*)').eq('related_type', 'Parte').eq('related_id', workOrderId).order('created_at', { ascending: false })));
      const signatures = await expectStep('Detalle parte / firmas', () => expectData<any[]>(supabase.from('work_order_signatures').select('*, files!work_order_signatures_file_id_fkey(*)').eq('work_order_id', workOrderId).order('signed_at', { ascending: false })));
      const photos = await expectStep('Detalle parte / fotos', () => expectData<any[]>(supabase.from('work_order_photos').select('*, files!work_order_photos_file_id_fkey(*), profiles!work_order_photos_taken_by_fkey(first_name,last_name)').eq('work_order_id', workOrderId).order('taken_at', { ascending: false })));

      const primaryAssignment = assignments.find((item) => item.role === 'Principal') ?? assignments[0];
      return {
        work_order: workOrder,
        ...workOrder,
        client: workOrder.clients,
        site: workOrder.sites,
        case: workOrder.cases,
        primary_equipment: workOrder.primary_equipment,
        additional_equipment: additional.map((item) => item.equipment).filter(Boolean),
        assignments,
        primary_technician: workOrder.primary_technician ?? primaryAssignment?.profiles ?? null,
        responsible: workOrder.responsible ?? null,
        support_technicians: assignments.filter((item) => item.role !== 'Principal').map((item) => item.profiles).filter(Boolean),
        status_history: history,
        time_entries: timeEntries,
        notes,
        materials,
        checks,
        alerts: alertRows,
        documents: documents.map((item) => item.documents).filter(Boolean),
        deficiencies,
        signatures: await Promise.all(signatures.map(withSignedFileUrl)),
        photos: await Promise.all(photos.map(withSignedFileUrl)),
        clients: workOrder.clients,
        sites: workOrder.sites,
        cases: workOrder.cases,
        equipment: workOrder.primary_equipment,
        work_order_assignments: assignments,
        work_order_status_history: history,
        work_order_time_entries: timeEntries,
        work_order_notes: notes,
        work_order_materials: materials,
      };
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error cargando detalle completo del parte', error);
      throw new Error(error instanceof Error ? `Error al cargar el parte completo. ${error.message}` : 'Error al cargar el parte completo.');
    }
  },
  async create(payload: Record<string, any>, role: string) {
    const companyId = payload.company_id || await currentCompanyId();
    const profileId = await currentProfileId();
    return expectData<string>(supabase.rpc('create_work_order_full', { p_payload: { ...payload, company_id: companyId, created_by: profileId, created_role: role } }));
  },
  update(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('work_orders').update(workOrderPayload(payload)).eq('id', id).select().maybeSingle());
  },
  async assign(workOrderId: string, technicianId: string, assignmentDate: string, start: string | null, end: string | null, role = 'Principal') {
    const profileId = await currentProfileId();
    return expectData<string>(supabase.rpc('assign_technician', { p_work_order_id: workOrderId, p_technician_id: technicianId, p_assignment_date: assignmentDate, p_start: start, p_end: end, p_role: role, p_assigned_by: profileId }));
  },
  async unassign(workOrderId: string, profileIdToRemove: string, reason?: string) {
    const profileId = await currentProfileId();
    return expectData<void>(supabase.rpc('unassign_work_order_profile', { p_work_order_id: workOrderId, p_profile_id: profileIdToRemove, p_changed_by: profileId, p_reason: reason ?? null }));
  },
  async assignCommercial(workOrderId: string, commercialId: string) {
    const profileId = await currentProfileId();
    return expectData<void>(supabase.rpc('assign_commercial_work_order', { p_work_order_id: workOrderId, p_commercial_id: commercialId, p_changed_by: profileId }));
  },
  async manageAssignments(workOrderId: string, payload: { main_technician_id?: string | null; support_technician_ids?: string[]; commercial_id?: string | null; assignment_date: string; planned_start_time?: string | null; planned_end_time?: string | null; reason?: string | null }) {
    const profileId = await currentProfileId();
    return expectData<void>(supabase.rpc('manage_work_order_assignments', {
      p_work_order_id: workOrderId,
      p_main_technician_id: payload.main_technician_id || null,
      p_support_technician_ids: payload.support_technician_ids ?? [],
      p_commercial_id: payload.commercial_id || null,
      p_assignment_date: payload.assignment_date,
      p_start: payload.planned_start_time || null,
      p_end: payload.planned_end_time || null,
      p_changed_by: profileId,
      p_reason: payload.reason || null,
    }));
  },
  async changeStatus(workOrderId: string, status: string, reason: string, manualCorrection = false) {
    return expectData<void>(supabase.rpc('dmp_change_work_order_status', { p_work_order_id: workOrderId, p_new_status: status, p_reason: reason || (manualCorrection ? 'Correccion manual' : 'Cambio directo de estado') }));
  },
  async requestReturn(workOrderId: string, reason: string) {
    return expectData<void>(supabase.rpc('request_work_order_return', { p_work_order_id: workOrderId, p_changed_by: null, p_reason: reason }));
  },
  async syncOfflineNote(workOrderId: string, payload: Record<string, any>, localChangeId?: string) {
    const note = [
      payload.diagnosis ? `Diagnóstico: ${payload.diagnosis}` : '',
      payload.work ? `Trabajo realizado: ${payload.work}` : '',
      payload.observations ? `Observaciones: ${payload.observations}` : '',
    ].filter(Boolean).join('\n');
    if (!note.trim()) throw new Error('No hay datos de intervención para sincronizar.');
    return expectData<string>(supabase.rpc('sync_work_order_note', { p_work_order_id: workOrderId, p_note: note, p_local_change_id: localChangeId ?? null }));
  },
  async syncOfflineMaterial(workOrderId: string, payload: Record<string, any>, localChangeId?: string) {
    const description = String(payload.material ?? '').trim();
    const quantity = Number(payload.quantity || 1);
    if (!description) throw new Error('Indica el material usado antes de sincronizar.');
    return expectData<string>(supabase.rpc('dmp_upsert_work_order_material', { p_payload: { work_order_id: workOrderId, description, quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1, local_change_id: localChangeId ?? null } }));
  },
  materialsCatalog(search = '') {
    let query = supabase.from('materials').select('*').is('deleted_at', null).order('description').limit(40);
    if (search) query = query.or(contains(['code', 'description', 'category'], search));
    return expectData<any[]>(query);
  },
  upsertTimeEntry(payload: Record<string, any>) {
    return expectData<string>(supabase.rpc('dmp_upsert_work_order_time_entry', { p_payload: payload }), { service: 'workOrdersService', operation: 'Guardar horas del parte', resource: 'dmp_upsert_work_order_time_entry' });
  },
  deleteTimeEntry(id: string, reason: string) {
    return expectData<void>(supabase.rpc('dmp_delete_work_order_time_entry', { p_time_entry_id: id, p_reason: reason }));
  },
  upsertMaterial(payload: Record<string, any>) {
    return expectData<string>(supabase.rpc('dmp_upsert_work_order_material', { p_payload: payload }), { service: 'workOrdersService', operation: 'Guardar material del parte', resource: 'dmp_upsert_work_order_material' });
  },
  deleteMaterial(id: string, reason: string) {
    return expectData<void>(supabase.rpc('dmp_delete_work_order_material', { p_material_usage_id: id, p_reason: reason }));
  },
  async syncOfflinePhoto(workOrderId: string, payload: Record<string, any>, localChangeId: string) {
    const companyId = await currentCompanyId();
    if (!companyId) throw new Error('No se ha podido determinar la empresa para subir la foto.');
    const localId = payload.id ?? localChangeId;
    const extension = String(payload.name ?? 'foto.jpg').split('.').pop() || 'jpg';
    const path = `${companyId}/work-orders/${workOrderId}/photos/${localId}.${extension}`;
    const uploaded = await uploadLocalFile(path, payload);
    try {
      return await expectData<string>(supabase.rpc('register_work_order_photo', { p_payload: { local_change_id: localChangeId, work_order_id: workOrderId, bucket: filesBucket, path, name: payload.name ?? `Foto ${localId}`, mime_type: payload.type ?? uploaded.mime, size_bytes: payload.size ?? uploaded.size, description: payload.description ?? null, metadata: { source: 'technician-offline' } } }));
    } catch (error) {
      await supabase.storage.from(filesBucket).remove([path]);
      throw error;
    }
  },
  async syncOfflineSignature(workOrderId: string, payload: Record<string, any>, localChangeId: string) {
    if (!String(payload.signerName ?? '').trim()) throw new Error('Falta el nombre de la persona firmante.');
    if (payload.acceptedTerms !== true) throw new Error('La aceptación expresa de la firma es obligatoria.');
    const companyId = await currentCompanyId();
    if (!companyId) throw new Error('No se ha podido determinar la empresa para subir la firma.');
    const path = `${companyId}/work-orders/${workOrderId}/signatures/${localChangeId}.png`;
    const uploaded = await uploadLocalFile(path, { ...payload, type: 'image/png', name: 'firma.png' });
    try {
      return await expectData<string>(supabase.rpc('register_work_order_signature', { p_payload: { local_change_id: localChangeId, work_order_id: workOrderId, bucket: filesBucket, path, name: 'firma.png', mime_type: uploaded.mime, size_bytes: uploaded.size, signer_name: payload.signerName, signer_role: payload.signerRole ?? null, signer_document: payload.signerDocument ?? null, accepted_terms: true, metadata: { source: 'technician-offline' } } }));
    } catch (error) {
      await supabase.storage.from(filesBucket).remove([path]);
      throw error;
    }
  },
  async syncOfflineDeficiency(workOrderId: string, payload: Record<string, any>, localChangeId: string) {
    const description = String(payload.description ?? '').trim();
    if (!description) throw new Error('Falta la descripción de la incidencia.');
    return expectData<string>(supabase.rpc('register_work_order_deficiency', { p_payload: { local_change_id: localChangeId, work_order_id: workOrderId, check_id: payload.checkId ?? null, block_id: payload.blockId ?? null, severity: payload.severity ?? 'Media', component: payload.component ?? null, description, recommended_action: payload.recommendedAction ?? null } }));
  },
};
