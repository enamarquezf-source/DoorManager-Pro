import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, currentProfileId, expectData } from './query';

const workOrderColumns = ['case_id', 'client_id', 'site_id', 'main_equipment_id', 'contact_id', 'access_requirement_id', 'title', 'description', 'type', 'priority', 'status', 'origin', 'scheduled_date', 'scheduled_time', 'estimated_duration_minutes', 'planned_material', 'technical_team', 'diagnosis', 'work_performed', 'result'];
function workOrderPayload(payload: Record<string, any>) {
  return Object.fromEntries(workOrderColumns.filter((key) => key in payload).map((key) => [key, payload[key] === '' ? null : payload[key]]));
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
  list(search = '') {
    let query = supabase.from('v_work_order_full_detail').select('*').order('scheduled_date', { ascending: false });
    if (search) query = query.or(contains(['code', 'title', 'description', 'client_name', 'site_name', 'equipment_code', 'status'], search));
    return expectData<any[]>(query);
  },
  async listWithAssignments(search = '') {
    const workOrders = await this.list(search);
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
  options() {
    return expectData<any[]>(supabase.from('work_orders').select('id, code, title, client_id, site_id, main_equipment_id, status').is('deleted_at', null).order('scheduled_date', { ascending: false }));
  },
  get(id: string) {
    return this.getWorkOrderFullDetail(id);
  },
  async getTechnicianAssigned(id: string) {
    const profileId = await currentProfileId();
    const assignment = await expectData<any>(supabase.from('work_order_assignments').select('id').eq('work_order_id', id).eq('technician_id', profileId).is('deleted_at', null).maybeSingle());
    if (!assignment) throw new Error('No tienes permiso para acceder a este parte');
    return this.getWorkOrderFullDetail(id);
  },
  async getWorkOrderFullDetail(workOrderId: string): Promise<WorkOrderFullDetail> {
    try {
      const workOrder = await expectData<any>(supabase.from('work_orders').select(`
        *,
        clients!work_orders_client_id_fkey(*),
        sites!work_orders_site_id_fkey(*),
        cases!work_orders_case_id_fkey(*),
        primary_equipment:equipment!work_orders_main_equipment_id_fkey(*),
        contact:client_contacts!work_orders_contact_id_fkey(*),
        access_requirement:access_requirements!work_orders_access_requirement_id_fkey(*),
        primary_technician:profiles!work_orders_main_technician_id_fkey(*),
        creator:profiles!work_orders_created_by_fkey(*)
      `).eq('id', workOrderId).maybeSingle());
      if (!workOrder) throw new Error('No se ha encontrado el parte solicitado.');

      const [additional, assignments, history, notes, materials, checks, deficiencies, alertRows, documents, signatures, photos] = await Promise.all([
        expectData<any[]>(supabase.from('work_order_equipment').select('*, equipment!work_order_equipment_equipment_id_fkey(*, equipment_types(*))').eq('work_order_id', workOrderId).eq('is_primary', false)),
        expectData<any[]>(supabase.from('work_order_assignments').select('*, profiles!work_order_assignments_technician_id_fkey(*)').eq('work_order_id', workOrderId).is('deleted_at', null).order('planned_start_time')),
        expectData<any[]>(supabase.from('work_order_status_history').select('*, profiles!work_order_status_history_changed_by_fkey(first_name,last_name)').eq('work_order_id', workOrderId).order('changed_at', { ascending: true })),
        expectData<any[]>(supabase.from('work_order_notes').select('*, profiles!work_order_notes_created_by_fkey(first_name,last_name)').eq('work_order_id', workOrderId).order('created_at', { ascending: true })),
        expectData<any[]>(supabase.from('work_order_materials').select('*, materials(*)').eq('work_order_id', workOrderId).order('created_at', { ascending: true })),
        expectData<any[]>(supabase.from('checks').select('*, check_templates(*), equipment!checks_equipment_id_fkey(*), profiles!checks_technician_id_fkey(first_name,last_name)').eq('work_order_id', workOrderId).is('deleted_at', null).order('created_at', { ascending: false })),
        expectData<any[]>(supabase.from('deficiencies').select('*, equipment!deficiencies_equipment_id_fkey(*), checks!deficiencies_check_id_fkey(code), profiles!deficiencies_responsible_profile_id_fkey(first_name,last_name)').eq('work_order_id', workOrderId).is('deleted_at', null).order('created_at', { ascending: false })),
        expectData<any[]>(supabase.from('alerts').select('*, alert_recipients(*)').eq('related_entity', 'work_orders').eq('related_id', workOrderId).is('deleted_at', null).order('created_at', { ascending: false })),
        expectData<any[]>(supabase.from('document_links').select('*, documents(*)').eq('related_type', 'Parte').eq('related_id', workOrderId).order('created_at', { ascending: false })),
        expectData<any[]>(supabase.from('work_order_signatures').select('*, files(*)').eq('work_order_id', workOrderId).order('signed_at', { ascending: false })),
        expectData<any[]>(supabase.from('work_order_photos').select('*, files(*)').eq('work_order_id', workOrderId).order('taken_at', { ascending: false })),
      ]);

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
        support_technicians: assignments.filter((item) => item.role !== 'Principal').map((item) => item.profiles).filter(Boolean),
        status_history: history,
        notes,
        materials,
        checks,
        alerts: alertRows,
        documents: documents.map((item) => item.documents).filter(Boolean),
        deficiencies,
        signatures,
        photos,
        clients: workOrder.clients,
        sites: workOrder.sites,
        cases: workOrder.cases,
        equipment: workOrder.primary_equipment,
        work_order_assignments: assignments,
        work_order_status_history: history,
        work_order_notes: notes,
        work_order_materials: materials,
      };
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error cargando detalle completo del parte', error);
      throw new Error(error instanceof Error ? `Error al cargar el parte completo. ${error.message}` : 'Error al cargar el parte completo.');
    }
  },
  async create(payload: Record<string, any>, role: string) {
    const companyId = await currentCompanyId();
    const profileId = await currentProfileId();
    const data = await expectData<string>(supabase.rpc('create_work_order', {
      p_company_id: companyId,
      p_client_id: payload.client_id,
      p_site_id: payload.site_id,
      p_title: payload.title,
      p_type: payload.type,
      p_priority: payload.priority,
      p_origin: payload.origin,
      p_created_by: profileId,
      p_created_role: role,
      p_description: payload.description || null,
      p_case_id: payload.case_id || null,
      p_main_equipment_id: payload.main_equipment_id || null,
    }));
    await supabase.from('work_orders').update({
      scheduled_date: payload.scheduled_date || null,
      scheduled_time: payload.scheduled_time || null,
      estimated_duration_minutes: payload.estimated_duration_minutes || null,
      contact_id: payload.contact_id || null,
      access_requirement_id: payload.access_requirement_id || null,
      planned_material: payload.planned_material || null,
    }).eq('id', data);
    if (payload.technician_id) await this.assign(data, payload.technician_id, payload.scheduled_date || new Date().toISOString().slice(0, 10), payload.scheduled_time || null, null, 'Principal');
    if (role === 'Comercial' && payload.type === 'Visita comercial' && !payload.technician_id) await this.assign(data, profileId, payload.scheduled_date || new Date().toISOString().slice(0, 10), payload.scheduled_time || null, null, 'Principal');
    return data;
  },
  update(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('work_orders').update(workOrderPayload(payload)).eq('id', id).select().maybeSingle());
  },
  async assign(workOrderId: string, technicianId: string, assignmentDate: string, start: string | null, end: string | null, role = 'Principal') {
    const profileId = await currentProfileId();
    return expectData<string>(supabase.rpc('assign_technician', { p_work_order_id: workOrderId, p_technician_id: technicianId, p_assignment_date: assignmentDate, p_start: start, p_end: end, p_role: role, p_assigned_by: profileId }));
  },
  async changeStatus(workOrderId: string, status: string, reason: string, manualCorrection = false) {
    const profileId = await currentProfileId();
    return expectData<void>(supabase.rpc('change_work_order_status', { p_work_order_id: workOrderId, p_new_status: status, p_changed_by: profileId, p_reason: reason, p_manual_correction: manualCorrection, p_lat: null, p_lng: null }));
  },
  async requestReturn(workOrderId: string, reason: string) {
    const profileId = await currentProfileId();
    return expectData<void>(supabase.rpc('request_work_order_return', { p_work_order_id: workOrderId, p_changed_by: profileId, p_reason: reason }));
  },
};
