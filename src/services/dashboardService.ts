import { supabase } from '../lib/supabase/client';
import { currentProfileId, expectData } from './query';

const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
};

export const dashboardService = {
  async getSatDashboardData() {
    const day = today();
    const prevDay = yesterday();
    const [workOrders, assignments, technicians, pendingChecks, completedChecks, deficiencies, alerts, materials] = await Promise.all([
      expectData<any[]>(supabase.from('v_work_order_full_detail').select('*').order('scheduled_time', { ascending: true })),
      expectData<any[]>(supabase.from('work_order_assignments').select('*, work_orders(code,title,status,scheduled_date,scheduled_time,priority,planned_material), profiles(first_name,last_name)').gte('assignment_date', prevDay).order('assignment_date', { ascending: false })),
      expectData<any[]>(supabase.from('profiles').select('*, profile_roles!inner(roles!inner(name))').eq('profile_roles.roles.name', 'Tecnico').eq('active', true).order('first_name')),
      expectData<any[]>(supabase.from('v_pending_checks').select('*').order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('v_completed_checks').select('*').gte('finished_at', `${day}T00:00:00`).order('finished_at', { ascending: false })),
      expectData<any[]>(supabase.from('deficiencies').select('*, clients(code,legal_name), equipment(code), work_orders(code)').is('deleted_at', null).order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('alerts').select('*').is('deleted_at', null).order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('work_order_materials').select('*, work_orders(code,title,status), materials(code,description)').order('created_at', { ascending: false })),
    ]);
    return { day, prevDay, workOrders, assignments, technicians, pendingChecks, completedChecks, deficiencies, alerts, materials };
  },

  async getCommercialDashboardData() {
    const [opportunities, quotes, deficiencies, alerts, clients, workOrders] = await Promise.all([
      expectData<any[]>(supabase.from('opportunities').select('*, clients(code,legal_name), equipment(code), profiles(first_name,last_name), quotes(code,status,total)').is('deleted_at', null).order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('quotes').select('*, clients(code,legal_name), opportunities(code,title)').is('deleted_at', null).order('issue_date', { ascending: false })),
      expectData<any[]>(supabase.from('deficiencies').select('*, clients(code,legal_name), equipment(code), profiles(first_name,last_name)').is('deleted_at', null).order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('alerts').select('*').is('deleted_at', null).order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('clients').select('id,code,legal_name,status,updated_at').is('deleted_at', null).order('updated_at', { ascending: false })),
      expectData<any[]>(supabase.from('v_work_order_full_detail').select('*').order('scheduled_date', { ascending: false })),
    ]);
    return { opportunities, quotes, deficiencies, alerts, clients, workOrders };
  },

  async getOfficeDashboardData() {
    const [documents, materials, materialRequests, workOrderMaterials, alerts, workOrders, suppliers] = await Promise.all([
      expectData<any[]>(supabase.from('documents').select('*, document_links(*)').is('deleted_at', null).order('updated_at', { ascending: false })),
      expectData<any[]>(supabase.from('materials').select('*').is('deleted_at', null).order('description')),
      expectData<any[]>(supabase.from('material_requests').select('*, work_orders(code,title,status)').is('deleted_at', null).order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('work_order_materials').select('*, work_orders(code,title,status), materials(code,description)').order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('alerts').select('*').is('deleted_at', null).order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('v_work_order_full_detail').select('*').order('scheduled_date', { ascending: false })),
      expectData<any[]>(supabase.from('suppliers').select('*').is('deleted_at', null).order('name')),
    ]);
    return { documents, materials, materialRequests, workOrderMaterials, alerts, workOrders, suppliers };
  },

  async getManagementDashboardData() {
    const [metrics, workOrders, deficiencies, alerts, clients, opportunities, quotes] = await Promise.all([
      expectData<any[]>(supabase.from('v_management_metrics').select('*')),
      expectData<any[]>(supabase.from('v_work_order_full_detail').select('*').order('scheduled_date', { ascending: false })),
      expectData<any[]>(supabase.from('deficiencies').select('*, clients(code,legal_name), equipment(code)').is('deleted_at', null).order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('alerts').select('*').is('deleted_at', null).order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('clients').select('id,code,legal_name,status').is('deleted_at', null).order('legal_name')),
      expectData<any[]>(supabase.from('opportunities').select('*, clients(code,legal_name)').is('deleted_at', null).order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('quotes').select('*, clients(code,legal_name)').is('deleted_at', null).order('issue_date', { ascending: false })),
    ]);
    return { metrics: metrics[0] ?? {}, workOrders, deficiencies, alerts, clients, opportunities, quotes };
  },

  async getTechnicianDailyWork(date = today()) {
    const profileId = await currentProfileId();
    const [schedule, alerts, pendingChecks] = await Promise.all([
      expectData<any[]>(supabase.from('v_technician_daily_schedule').select('*').eq('technician_id', profileId).eq('assignment_date', date).order('planned_start_time')),
      expectData<any[]>(supabase.from('alert_recipients').select('*, alerts(*)').eq('recipient_profile_id', profileId).is('closed_at', null).order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('v_pending_checks').select('*').eq('technician_id', profileId).order('created_at', { ascending: false })),
    ]);
    return { date, schedule, alerts, pendingChecks };
  },
};
