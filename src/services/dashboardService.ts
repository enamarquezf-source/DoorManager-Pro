import { supabase } from '../lib/supabase/client';
import { currentProfileCompanyId, currentProfileId, expectData, expectStep } from './query';

const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
};

export const satDashboardAssignmentsSelect = '*, work_orders!work_order_assignments_work_order_id_fkey(code,title,status,scheduled_date,scheduled_time,priority,planned_material), profiles!work_order_assignments_technician_id_fkey(first_name,last_name)';

export const dashboardService = {
  async getSatDashboardData() {
    const companyId = await currentProfileCompanyId();
    const day = today();
    const prevDay = yesterday();
    const workOrders = await expectStep('Inicio SAT / partes', () => expectData<any[]>(supabase.from('v_work_order_full_detail').select('*').eq('company_id', companyId).order('scheduled_time', { ascending: true }), { service: 'dashboardService', operation: 'Inicio SAT / partes', resource: 'v_work_order_full_detail' }));
    const assignments = await expectStep('Inicio SAT / asignaciones', () => expectData<any[]>(supabase.from('work_order_assignments').select(satDashboardAssignmentsSelect).eq('company_id', companyId).gte('assignment_date', prevDay).order('assignment_date', { ascending: false }), { service: 'dashboardService', operation: 'Inicio SAT / asignaciones', resource: 'work_order_assignments' }));
    const technicians = await expectStep('Inicio SAT / tecnicos', () => expectData<any[]>(supabase.from('profiles').select('*, profile_roles!profile_roles_profile_id_fkey(roles!profile_roles_role_id_fkey(name))').eq('company_id', companyId).eq('active', true).is('deleted_at', null).order('first_name'), { service: 'dashboardService', operation: 'Inicio SAT / tecnicos', resource: 'profiles' }));
    const pendingChecks = await expectStep('Inicio SAT / checks pendientes', () => expectData<any[]>(supabase.from('v_pending_checks').select('*').eq('company_id', companyId).order('created_at', { ascending: false }), { service: 'dashboardService', operation: 'Inicio SAT / checks pendientes', resource: 'v_pending_checks' }));
    const completedChecks = await expectStep('Inicio SAT / checks realizados', () => expectData<any[]>(supabase.from('v_completed_checks').select('*').eq('company_id', companyId).gte('finished_at', `${day}T00:00:00`).order('finished_at', { ascending: false }), { service: 'dashboardService', operation: 'Inicio SAT / checks realizados', resource: 'v_completed_checks' }));
    const deficiencies = await expectStep('Inicio SAT / deficiencias', () => expectData<any[]>(supabase.from('deficiencies').select('*, clients!deficiencies_client_id_fkey(code,legal_name), equipment!deficiencies_equipment_id_fkey(code), work_orders!deficiencies_work_order_id_fkey(code)').eq('company_id', companyId).is('deleted_at', null).order('created_at', { ascending: false }), { service: 'dashboardService', operation: 'Inicio SAT / deficiencias', resource: 'deficiencies' }));
    const alerts = await expectStep('Inicio SAT / avisos', () => expectData<any[]>(supabase.from('alerts').select('*').eq('company_id', companyId).is('deleted_at', null).order('created_at', { ascending: false }), { service: 'dashboardService', operation: 'Inicio SAT / avisos', resource: 'alerts' }));
    const materials = await expectStep('Inicio SAT / materiales', () => expectData<any[]>(supabase.from('work_order_materials').select('*, work_orders!work_order_materials_work_order_id_fkey(code,title,status), materials!work_order_materials_material_id_fkey(code,description)').eq('company_id', companyId).order('created_at', { ascending: false }), { service: 'dashboardService', operation: 'Inicio SAT / materiales', resource: 'work_order_materials' }));
    return { day, prevDay, workOrders, assignments, technicians: technicians.filter((row) => row.primary_area === 'Tecnico' || row.profile_roles?.some((item: any) => item.roles?.name === 'Tecnico')), pendingChecks, completedChecks, deficiencies, alerts, materials };
  },

  async getCommercialDashboardData() {
    const companyId = await currentProfileCompanyId();
    const [opportunities, quotes, deficiencies, alerts, clients, workOrders] = await Promise.all([
      expectData<any[]>(supabase.from('opportunities').select('*, clients!opportunities_client_id_fkey(code,legal_name), equipment!opportunities_equipment_id_fkey(code), profiles!opportunities_responsible_profile_id_fkey(first_name,last_name), quotes!quotes_opportunity_id_fkey(code,status,total)').eq('company_id', companyId).is('deleted_at', null).order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('quotes').select('*, clients!quotes_client_id_fkey(code,legal_name), opportunities!quotes_opportunity_id_fkey(code,title)').eq('company_id', companyId).is('deleted_at', null).order('issue_date', { ascending: false })),
      expectData<any[]>(supabase.from('deficiencies').select('*, clients!deficiencies_client_id_fkey(code,legal_name), equipment!deficiencies_equipment_id_fkey(code), profiles!deficiencies_responsible_profile_id_fkey(first_name,last_name)').eq('company_id', companyId).is('deleted_at', null).order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('alerts').select('*').eq('company_id', companyId).is('deleted_at', null).order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('clients').select('id,code,legal_name,status,updated_at').eq('company_id', companyId).is('deleted_at', null).order('updated_at', { ascending: false })),
      expectData<any[]>(supabase.from('v_work_order_full_detail').select('*').eq('company_id', companyId).order('scheduled_date', { ascending: false })),
    ]);
    return { opportunities, quotes, deficiencies, alerts, clients, workOrders };
  },

  async getOfficeDashboardData() {
    const companyId = await currentProfileCompanyId();
    const [documents, materials, materialRequests, workOrderMaterials, alerts, workOrders, suppliers] = await Promise.all([
      expectData<any[]>(supabase.from('documents').select('*, document_links!document_links_document_id_fkey(*)').eq('company_id', companyId).is('deleted_at', null).order('updated_at', { ascending: false })),
      expectData<any[]>(supabase.from('materials').select('*').eq('company_id', companyId).is('deleted_at', null).order('description')),
      expectData<any[]>(supabase.from('material_requests').select('*, work_orders!material_requests_work_order_id_fkey(code,title,status)').eq('company_id', companyId).is('deleted_at', null).order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('work_order_materials').select('*, work_orders!work_order_materials_work_order_id_fkey(code,title,status), materials!work_order_materials_material_id_fkey(code,description)').eq('company_id', companyId).order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('alerts').select('*').eq('company_id', companyId).is('deleted_at', null).order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('v_work_order_full_detail').select('*').eq('company_id', companyId).order('scheduled_date', { ascending: false })),
      expectData<any[]>(supabase.from('suppliers').select('*').eq('company_id', companyId).is('deleted_at', null).order('name')),
    ]);
    return { documents, materials, materialRequests, workOrderMaterials, alerts, workOrders, suppliers };
  },

  async getManagementDashboardData() {
    const companyId = await currentProfileCompanyId();
    const [metrics, workOrders, deficiencies, alerts, clients, opportunities, quotes] = await Promise.all([
      expectData<any[]>(supabase.from('v_management_metrics').select('*').eq('company_id', companyId)),
      expectData<any[]>(supabase.from('v_work_order_full_detail').select('*').eq('company_id', companyId).order('scheduled_date', { ascending: false })),
      expectData<any[]>(supabase.from('deficiencies').select('*, clients!deficiencies_client_id_fkey(code,legal_name), equipment!deficiencies_equipment_id_fkey(code)').eq('company_id', companyId).is('deleted_at', null).order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('alerts').select('*').eq('company_id', companyId).is('deleted_at', null).order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('clients').select('id,code,legal_name,status').eq('company_id', companyId).is('deleted_at', null).order('legal_name')),
      expectData<any[]>(supabase.from('opportunities').select('*, clients!opportunities_client_id_fkey(code,legal_name)').eq('company_id', companyId).is('deleted_at', null).order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('quotes').select('*, clients!quotes_client_id_fkey(code,legal_name)').eq('company_id', companyId).is('deleted_at', null).order('issue_date', { ascending: false })),
    ]);
    return { metrics: metrics[0] ?? {}, workOrders, deficiencies, alerts, clients, opportunities, quotes };
  },

  async getTechnicianDailyWork(date = today()) {
    const profileId = await currentProfileId();
    const [schedule, alerts, pendingChecks] = await Promise.all([
      expectData<any[]>(supabase.from('v_technician_daily_schedule').select('*').eq('technician_id', profileId).eq('assignment_date', date).order('planned_start_time')),
      expectData<any[]>(supabase.from('alert_recipients').select('*, alerts!alert_recipients_alert_id_fkey(*)').eq('recipient_profile_id', profileId).is('closed_at', null).order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('v_pending_checks').select('*').eq('technician_id', profileId).order('created_at', { ascending: false })),
    ]);
    return { date, schedule, alerts, pendingChecks };
  },
};
