import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, currentProfileId, expectData, expectStep, toSpanishSupabaseError } from './query';
import { isOfficeValidationUnavailable } from '../shared/officeValidation';
import { filesBucket, withSignedFileUrl } from '../shared/signedFiles';
import { applyArchiveFilter, type ArchiveFilter } from './entityLifecycleService';

const workOrderColumns = ['case_id', 'quote_id', 'client_id', 'site_id', 'main_equipment_id', 'contact_id', 'access_requirement_id', 'title', 'description', 'type', 'priority', 'status', 'origin', 'scheduled_date', 'scheduled_time', 'estimated_duration_minutes', 'planned_material', 'technical_team', 'diagnosis', 'work_performed', 'result'];
function workOrderPayload(payload: Record<string, any>) {
  return Object.fromEntries(workOrderColumns.filter((key) => key in payload).map((key) => [key, payload[key] === '' ? null : payload[key]]));
}
const workOrderOperationalColumns = ['description', 'diagnosis', 'work_performed', 'result', 'observations', 'planned_material'];
function workOrderOperationalPayload(payload: Record<string, any>) {
  return Object.fromEntries(workOrderOperationalColumns.filter((key) => key in payload && payload[key] !== undefined).map((key) => [key, payload[key]]));
}

export function serverResolvedEconomicPayload(payload: Record<string, any>) {
  const next = { ...payload };
  delete next.hourly_cost;
  delete next.hourly_price;
  delete next.unit_cost;
  delete next.unit_price;
  return next;
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
  associated_equipment: any[];
  assignments: any[];
  primary_technician: any;
  support_technicians: any[];
  status_history: any[];
  time_entries: any[];
  notes: any[];
  materials: any[];
  planned_quote_lines: any[];
  planned_quote_line_decisions: any[];
  planned_material_lines: any[];
  planned_material_decisions: any[];
  cost_entries: any[];
  checks: any[];
  alerts: any[];
  documents: any[];
  deficiencies: any[];
  signatures: any[];
  photos: any[];
};

export type OfficeReviewDecision = 'validated' | 'rejected';
export type SatReviewDecision = 'approved' | 'returned';
export type SatReviewDestination = 'comercial' | 'facturacion';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const workOrdersService = {
  async hasOfficeValidation() {
    const { data, error } = await supabase.from('work_orders').select('office_validation_status').limit(0);
    if (error) {
      if (isOfficeValidationUnavailable(error)) return false;
      throw new Error(toSpanishSupabaseError(error));
    }
    return data !== null;
  },
  async list(search = '', companyScope?: string | null, archiveFilter: ArchiveFilter = 'active') {
    const companyId = companyScope === undefined ? await currentCompanyId() : companyScope;
    let query = applyArchiveFilter(supabase.from('v_work_order_full_detail').select('*'), archiveFilter).order('scheduled_date', { ascending: false });
    if (companyId) query = query.eq('company_id', companyId);
    if (search) query = query.or(contains(['code', 'title', 'description', 'client_name', 'site_name', 'equipment_code', 'status'], search));
    const workOrders = await expectData<any[]>(query);
    if (!workOrders.length || !(await this.hasOfficeValidation())) return workOrders;
    const ids = workOrders.map((item) => item.id).filter(Boolean);
    if (!ids.length) return workOrders;
    const validationRows = await expectData<any[]>(supabase.from('work_orders').select('id,office_validation_status').in('id', ids));
    const validationById = new Map(validationRows.map((row) => [row.id, row.office_validation_status]));
    return workOrders.map((work) => ({ ...work, office_validation_status: validationById.get(work.id) ?? 'not_started' }));
  },
  async routingQueue(queue: 'sat' | 'commercial' | 'billing') {
    return expectData<any[]>(supabase.rpc('dmp_department_routing_queue', { p_queue: queue }), { service: 'workOrdersService', operation: `Cola departamental ${queue}`, resource: 'dmp_department_routing_queue' });
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
    if (!assignment) {
      const work = await expectData<any>(supabase.from('work_orders').select('status,deleted_at').eq('id', id).maybeSingle(), { service: 'workOrdersService', operation: 'Motivo de bloqueo tecnico', resource: id });
      if (work?.status) throw new Error(`Parte bloqueado. Motivo: ${work.status === 'Finalizado tecnicamente' ? 'Finalizado técnicamente' : work.status === 'Cerrado' ? 'Cerrado por SAT' : work.status === 'Cancelado' ? 'Cancelado' : 'Usuario sin asignación activa'}.`);
      throw new Error('Parte bloqueado. Motivo: usuario sin permiso o parte no disponible.');
    }
    if (!['Pendiente','Trabajo descargado','En desplazamiento','En intervencion','Pausado','Pendiente de material'].includes(assignment.work_orders?.status)) throw new Error(`Parte bloqueado. Motivo: ${assignment.work_orders?.status === 'Finalizado tecnicamente' ? 'Finalizado técnicamente' : assignment.work_orders?.status ?? 'no está en trabajo activo'}. Revísalo desde Historial.`);
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
        creator:profiles!work_orders_created_by_fkey(*),
        updated_by_profile:profiles!work_orders_updated_by_fkey(first_name,last_name,primary_area),
        quotes!work_orders_quote_id_fkey(id,code,title,status,total_amount,total)
      `).eq('id', workOrderId).maybeSingle());
      if (!workOrder) throw new Error('No se ha encontrado el parte solicitado.');

      const associated = await expectStep('Detalle parte / equipos asociados', () => expectData<any[]>(supabase.from('work_order_equipment').select('*, equipment!work_order_equipment_equipment_id_fkey(*, equipment_types!equipment_equipment_type_id_fkey(*))').eq('work_order_id', workOrderId).order('is_primary', { ascending: false }).order('created_at')));
      const compatibleCheckTemplates = await expectStep('Detalle parte / plantillas compatibles', () => expectData<any[]>(supabase.from('check_templates').select('id, equipment_type_id, company_id, name').eq('active', true).or(`company_id.eq.${workOrder.company_id},company_id.is.null`)));
      const assignments = await expectStep('Detalle parte / asignaciones', () => expectData<any[]>(supabase.from('work_order_assignments').select('*, profiles!work_order_assignments_technician_id_fkey(*)').eq('work_order_id', workOrderId).is('deleted_at', null).order('planned_start_time')));
      const history = await expectStep('Detalle parte / historial estados', () => expectData<any[]>(supabase.from('work_order_status_history').select('*, profiles!work_order_status_history_changed_by_fkey(first_name,last_name)').eq('work_order_id', workOrderId).order('changed_at', { ascending: true })));
      const timeEntries = await expectStep('Detalle parte / horas', () => expectData<any[]>(supabase.from('work_order_time_entries').select('*, profiles!work_order_time_entries_profile_id_fkey(first_name,last_name,primary_area), created_by_profile:profiles!work_order_time_entries_created_by_fkey(first_name,last_name,primary_area), updated_by_profile:profiles!work_order_time_entries_updated_by_fkey(first_name,last_name,primary_area)').eq('work_order_id', workOrderId).order('work_date', { ascending: true })));
      const notes = await expectStep('Detalle parte / notas', () => expectData<any[]>(supabase.from('work_order_notes').select('*, profiles!work_order_notes_created_by_fkey(first_name,last_name)').eq('work_order_id', workOrderId).order('created_at', { ascending: true })));
      const materials = await expectStep('Detalle parte / materiales', () => expectData<any[]>(supabase.from('work_order_materials').select('*, materials!work_order_materials_material_id_fkey(*), profiles!work_order_materials_registered_by_fkey(first_name,last_name,primary_area)').eq('work_order_id', workOrderId).is('deleted_at', null).order('created_at', { ascending: true })));
      const plannedQuoteLines = workOrder.quote_id ? await expectStep('Detalle parte / conceptos previstos', () => expectData<any[]>(supabase.from('quote_lines').select('*, materials!quote_lines_material_id_fkey(*)').eq('quote_id', workOrder.quote_id).is('deleted_at', null).order('position', { ascending: true }))) : [];
      const plannedQuoteLineDecisions = workOrder.quote_id ? await expectStep('Detalle parte / decisiones conceptos previstos', () => expectData<any[]>(supabase.from('work_order_quote_line_decisions').select('*').eq('work_order_id', workOrderId).is('deleted_at', null))) : [];
      const plannedMaterialLines = plannedQuoteLines.filter((line: any) => line.line_type === 'material' || line.material_id);
      const plannedMaterialDecisions = workOrder.quote_id ? await expectStep('Detalle parte / decisiones materiales previstos', () => expectData<any[]>(supabase.from('work_order_planned_material_decisions').select('*').eq('work_order_id', workOrderId).is('deleted_at', null))) : [];
      const costEntries = await expectStep('Detalle parte / recursos y costes', () => expectData<any[]>(supabase.from('work_order_cost_entries').select('*, profiles!work_order_cost_entries_registered_by_fkey(first_name,last_name,primary_area)').eq('work_order_id', workOrderId).is('deleted_at', null).order('incurred_at', { ascending: true })));
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
        additional_equipment: associated.filter((item) => !item.is_primary).map((item) => item.equipment).filter(Boolean),
        associated_equipment: associated,
        compatible_check_templates: compatibleCheckTemplates,
        assignments,
        primary_technician: workOrder.primary_technician ?? primaryAssignment?.profiles ?? null,
        responsible: workOrder.responsible ?? null,
        support_technicians: assignments.filter((item) => item.role !== 'Principal').map((item) => item.profiles).filter(Boolean),
        status_history: history,
        time_entries: timeEntries,
        notes,
        materials,
        planned_quote_lines: plannedQuoteLines,
        planned_quote_line_decisions: plannedQuoteLineDecisions,
        planned_material_lines: plannedMaterialLines,
        planned_material_decisions: plannedMaterialDecisions,
        cost_entries: costEntries,
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
        work_order_quote_line_decisions: plannedQuoteLineDecisions,
        work_order_planned_material_decisions: plannedMaterialDecisions,
        work_order_cost_entries: costEntries,
      };
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error cargando detalle completo del parte', error);
      throw new Error(error instanceof Error ? `Error al cargar el parte completo. ${error.message}` : 'Error al cargar el parte completo.');
    }
  },
  async create(payload: Record<string, any>, role: string) {
    const companyId = payload.company_id || await currentCompanyId();
    const profileId = await currentProfileId();
    const rpcPayload = { ...payload, company_id: companyId, created_by: profileId, created_role: role };
    try {
      return await expectData<string>(supabase.rpc('dmp_create_work_order_full', { p_payload: rpcPayload }), { service: 'workOrdersService', operation: 'create work order', resource: 'dmp_create_work_order_full' });
    } catch (error: any) {
      if (import.meta.env.DEV || error?.code === 'PGRST202') console.error('create_work_order_full failed', { code: error?.code, message: error?.message, details: error?.details, hint: error?.hint });
      throw error;
    }
  },
  update(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('work_orders').update(workOrderPayload(payload)).eq('id', id).select().maybeSingle());
  },
  async updateOperationalFields(id: string, payload: Record<string, any>) {
    const operationalPayload = workOrderOperationalPayload(payload);
    const params = { p_work_order_id: id, p_payload: operationalPayload };
    const { data, error } = await supabase.rpc('dmp_update_work_order_operational_fields', params);
    if (error) {
      console.error('DMP operational update failed', { rpc: 'dmp_update_work_order_operational_fields', workOrderId: id, payload: operationalPayload, message: error?.message, details: error?.details, hint: error?.hint, code: error?.code, name: error?.name });
    }
    return expectData<any>(Promise.resolve({ data, error }), { service: 'workOrdersService', operation: 'Corregir campos operativos del parte', resource: 'dmp_update_work_order_operational_fields' });
  },
  async assign(workOrderId: string, technicianId: string, assignmentDate: string, start: string | null, end: string | null, role = 'Principal') {
    const profileId = await currentProfileId();
    return expectData<string>(supabase.rpc('assign_technician', { p_work_order_id: workOrderId, p_technician_id: technicianId, p_assignment_date: assignmentDate, p_start: start, p_end: end, p_role: role, p_assigned_by: profileId }));
  },
  async unassign(workOrderId: string, profileIdToRemove: string, reason?: string, assignmentType: 'technical' | 'commercial' = 'technical') {
    const profileId = await currentProfileId();
    return expectData<void>(supabase.rpc('unassign_work_order_profile', { p_work_order_id: workOrderId, p_profile_id: profileIdToRemove, p_changed_by: profileId, p_reason: reason ?? null, p_assignment_type: assignmentType }));
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
    if (status === 'Finalizado tecnicamente') {
      return expectData<void>(supabase.rpc('dmp_finalize_work_order_technical', { p_work_order_id: workOrderId, p_payload: { reason: reason || 'Cierre tecnico del parte' } }), { service: 'workOrdersService', operation: 'Finalizar parte tecnico', resource: 'dmp_finalize_work_order_technical' });
    }
    return expectData<void>(supabase.rpc('dmp_change_work_order_status', { p_work_order_id: workOrderId, p_new_status: status, p_reason: reason || (manualCorrection ? 'Correccion manual' : 'Cambio directo de estado') }));
  },
  async finalizeTechnical(workOrderId: string, payload: Record<string, any> = {}) {
    const { data, error } = await supabase.rpc('dmp_finalize_work_order_technical', { p_work_order_id: workOrderId, p_payload: payload });
    if (error) {
      console.error('DMP finalize technical work order failed', { workOrderId, payload, currentStatus: payload.currentStatus, message: error?.message, details: error?.details, hint: error?.hint, code: error?.code, name: error?.name });
    }
    return expectData<any>(Promise.resolve({ data, error }), { service: 'workOrdersService', operation: 'Finalizar parte tecnico', resource: 'dmp_finalize_work_order_technical' });
  },
  reviewWorkOrderOffice(workOrderId: string, decision: OfficeReviewDecision, reason: string) {
    if (!uuidPattern.test(String(workOrderId ?? '').trim())) throw new Error('validacion del formulario: falta un parte valido');
    if (!['validated', 'rejected'].includes(decision)) throw new Error('validacion del formulario: decision de oficina no valida');
    if (!String(reason ?? '').trim()) throw new Error('validacion del formulario: el motivo o comentario es obligatorio');
    return expectData<any>(supabase.rpc('dmp_review_work_order_office', { p_work_order_id: workOrderId, p_decision: decision, p_reason: reason.trim() }), { service: 'workOrdersService', operation: 'Validar parte en oficina', resource: workOrderId });
  },
  reviewWorkOrderSat(workOrderId: string, decision: SatReviewDecision, destination: SatReviewDestination | null, commercialProfileId: string | null, flags: Record<string, boolean>, reason: string) {
    if (!uuidPattern.test(String(workOrderId ?? '').trim())) throw new Error('validacion del formulario: falta un parte valido');
    if (!['approved', 'returned'].includes(decision)) throw new Error('revision SAT: decision no valida');
    if (decision === 'approved' && !destination) throw new Error('revision SAT: indica un destino');
    const normalizedReason = String(reason ?? '').trim() || 'Sin observaciones internas';
    const normalizedFlags = Object.fromEntries(['materials_entered', 'work_completed', 'non_billable_materials_or_hours'].map((key) => [key, flags?.[key] === true]));
    if (destination === 'comercial' && !commercialProfileId) throw new Error('revision SAT: selecciona un comercial responsable');
    if (destination === 'facturacion' && commercialProfileId) throw new Error('revision SAT: Facturacion no admite comercial responsable');
    return expectData<any>(supabase.rpc('dmp_review_work_order_sat', { p_work_order_id: workOrderId, p_decision: decision, p_destination: destination, p_commercial_profile_id: commercialProfileId, p_flags: normalizedFlags, p_reason: normalizedReason }), { service: 'workOrdersService', operation: 'Revisar parte en SAT', resource: workOrderId });
  },
  reviewWorkOrderCommercial(workOrderId: string, reason: string) {
    if (!uuidPattern.test(String(workOrderId ?? '').trim())) throw new Error('validacion del formulario: falta un parte valido');
    if (!String(reason ?? '').trim()) throw new Error('revision Comercial: el comentario o motivo es obligatorio');
    return expectData<any>(supabase.rpc('dmp_review_work_order_commercial', { p_work_order_id: workOrderId, p_reason: reason.trim() }), { service: 'workOrdersService', operation: 'Aprobar parte en Comercial', resource: workOrderId });
  },
  reassignWorkOrderCommercial(workOrderId: string, commercialProfileId: string) {
    if (!uuidPattern.test(String(workOrderId ?? '').trim()) || !uuidPattern.test(String(commercialProfileId ?? '').trim())) throw new Error('validacion del formulario: faltan identificadores validos');
    return expectData<any>(supabase.rpc('dmp_reassign_work_order_commercial', { p_work_order_id: workOrderId, p_commercial_profile_id: commercialProfileId }), { service: 'workOrdersService', operation: 'Reasignar comercial del parte', resource: workOrderId });
  },
  async generatePendingInstallationCheck(workOrderId: string, equipmentId: string) {
    return expectData<string>(supabase.rpc('generate_pending_installation_check', { p_work_order_id: workOrderId, p_equipment_id: equipmentId }), { service: 'workOrdersService', operation: 'Generar check de instalacion pendiente', resource: workOrderId });
  },
  setEntryBilling(kind: 'material' | 'time', entryId: string, additional: boolean) {
    return expectData<void>(supabase.rpc('dmp_set_work_order_entry_billing', { p_kind: kind, p_entry_id: entryId, p_additional: additional }), { service: 'workOrdersService', operation: 'Clasificar venta adicional', resource: entryId });
  },
  setWarrantyBillingDecision(workOrderId: string, conceptType: 'planned_material' | 'quote_line', conceptId: string, billingDecision: 'cubierto_garantia' | 'facturable') {
    return expectData<string>(supabase.rpc('dmp_set_work_order_billing_decision', { p_work_order_id: workOrderId, p_concept_type: conceptType, p_concept_id: conceptId, p_billing_decision: billingDecision }), { service: 'workOrdersService', operation: 'Decidir facturación de garantía', resource: conceptId });
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
    return expectData<string>(supabase.rpc('dmp_submit_work_order_material', { p_payload: { work_order_id: workOrderId, description, quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1, local_change_id: localChangeId ?? null } }));
  },
  materialsCatalog(search = '') {
    let query = supabase.from('materials').select('*').is('deleted_at', null).eq('active', true).order('description').limit(40);
    if (search) query = query.or(contains(['code', 'description', 'manufacturer', 'reference'], search));
    return expectData<any[]>(query);
  },
  warehousesCatalog() {
    return expectData<any[]>(supabase.from('warehouses').select('id,code,name').is('deleted_at', null).eq('active', true).order('name'));
  },
  warehouseStockCatalog() {
    return expectData<any[]>(supabase.from('warehouse_stock').select('warehouse_id,material_id,quantity'));
  },
  pendingMaterialValidations(search = '') {
    let query = supabase.from('work_order_materials').select('id,company_id,work_order_id,material_id,description,used_quantity,unit,used_at,created_at,stock_validation_status,stock_warehouse_id,work_orders!work_order_materials_work_order_id_fkey(code,title,clients(legal_name),sites(name)),materials!work_order_materials_material_id_fkey(code,description),profiles!work_order_materials_registered_by_fkey(first_name,last_name)').eq('stock_validation_status', 'pending').is('deleted_at', null).order('created_at', { ascending: true });
    if (search) query = query.or(contains(['description'], search));
    return expectData<any[]>(query);
  },
  upsertTimeEntry(payload: Record<string, any>) {
    return expectData<string>(supabase.rpc('dmp_upsert_work_order_time_entry', { p_payload: serverResolvedEconomicPayload(payload) }), { service: 'workOrdersService', operation: 'Guardar horas del parte', resource: 'dmp_upsert_work_order_time_entry' });
  },
  timeWorkerOptions(workOrderId: string) {
    return expectData<any[]>(supabase.rpc('dmp_work_order_time_worker_options', { p_work_order_id: workOrderId }), { service: 'workOrdersService', operation: 'Trabajadores disponibles para horas', resource: 'dmp_work_order_time_worker_options' });
  },
  deleteTimeEntry(id: string, reason: string) {
    return expectData<void>(supabase.rpc('dmp_delete_work_order_time_entry', { p_time_entry_id: id, p_reason: reason }));
  },
  upsertMaterial(payload: Record<string, any>) {
    // Guardar material del parte now means submit for validation; dmp_upsert_work_order_material is legacy.
    return expectData<string>(supabase.rpc('dmp_submit_work_order_material', { p_payload: payload }), { service: 'workOrdersService', operation: 'Registrar material pendiente de validacion', resource: 'dmp_submit_work_order_material' });
  },
  validateMaterialStock(id: string) {
    return expectData<string>(supabase.rpc('dmp_validate_work_order_material', { p_work_order_material_id: id }), { service: 'workOrdersService', operation: 'Validar consumo de stock', resource: id });
  },
  openInitialWarehouseStock(warehouseId: string, materialId: string, quantity: number, reason: string) {
    if (!String(reason ?? '').trim()) throw new Error('Indica el motivo de apertura del stock.');
    return expectData<string>(supabase.rpc('dmp_set_initial_warehouse_stock', { p_warehouse_id: warehouseId, p_material_id: materialId, p_quantity: quantity, p_reason: reason.trim() }), { service: 'workOrdersService', operation: 'Abrir stock inicial de almacen', resource: materialId });
  },
  openInitialWarehouseStockBatch(payload: { warehouse_id: string; items: Array<{ material_id: string; quantity: number }>; reason: string; source: string; idempotency_key: string }) {
    if (!String(payload.reason ?? '').trim()) throw new Error('Indica el motivo de apertura del stock.');
    if (!payload.items.length) throw new Error('Selecciona al menos un material para abrir stock.');
    return expectData<string>(supabase.rpc('dmp_set_initial_warehouse_stock_batch', { p_payload: { ...payload, reason: payload.reason.trim() } }), { service: 'workOrdersService', operation: 'Abrir stock inicial masivo', resource: payload.idempotency_key });
  },
  setPlannedMaterialDecision(payload: Record<string, any>) {
    return expectData<string>(supabase.rpc('dmp_set_work_order_planned_material_decision', { p_payload: payload }), { service: 'workOrdersService', operation: 'Registrar decision de material previsto', resource: 'dmp_set_work_order_planned_material_decision' });
  },
  setPlannedQuoteLineDecision(payload: Record<string, any>) {
    const technical = payload.unit_cost === '' || payload.technical === true;
    const nextPayload = technical ? { work_order_id: payload.work_order_id, quote_line_id: payload.quote_line_id, decision: payload.decision, actual_quantity: payload.quantity, technical_notes: payload.notes } : payload;
    return expectData<string>(supabase.rpc(technical ? 'dmp_resolve_planned_concept_technical' : 'dmp_set_work_order_quote_line_decision', { p_payload: nextPayload }), { service: 'workOrdersService', operation: technical ? 'Resolver concepto previsto tecnicamente' : 'Registrar decision de concepto previsto', resource: technical ? 'dmp_resolve_planned_concept_technical' : 'dmp_set_work_order_quote_line_decision' });
  },
  setTechnicalPlannedQuoteLineDecision(payload: Record<string, any>) {
    return expectData<string>(supabase.rpc('dmp_resolve_planned_concept_technical', { p_payload: payload }), { service: 'workOrdersService', operation: 'Resolver concepto previsto tecnicamente', resource: 'dmp_resolve_planned_concept_technical' });
  },
  deleteMaterial(id: string, reason: string) {
    return expectData<void>(supabase.rpc('dmp_delete_work_order_material', { p_material_usage_id: id, p_reason: reason }));
  },
  upsertCostEntry(payload: Record<string, any>) {
    return expectData<string>(supabase.rpc('dmp_upsert_work_order_cost_entry', { p_payload: serverResolvedEconomicPayload(payload) }), { service: 'workOrdersService', operation: 'Guardar recurso o coste del parte', resource: 'dmp_upsert_work_order_cost_entry' });
  },
  deleteCostEntry(id: string, reason: string) {
    return expectData<string>(supabase.rpc('dmp_delete_work_order_cost_entry', { p_cost_entry_id: id, p_reason: reason }));
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
