import { supabase } from '../lib/supabase/client';
import { expectData } from './query';

export const superadminService = {
  async overview() {
    const [profiles, roles, clients, sites, equipment, workOrders, checks, templates, activity, audit] = await Promise.all([
      expectData<any[]>(supabase.from('profiles').select('*, profile_roles(roles(name))').order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('roles').select('*').order('name')),
      expectData<any[]>(supabase.from('clients').select('id,status,created_at').is('deleted_at', null)),
      expectData<any[]>(supabase.from('sites').select('id,active,created_at').is('deleted_at', null)),
      expectData<any[]>(supabase.from('equipment').select('id,status,created_at').is('deleted_at', null)),
      expectData<any[]>(supabase.from('work_orders').select('id,status,created_at').is('deleted_at', null)),
      expectData<any[]>(supabase.from('checks').select('id,status,global_result,created_at').is('deleted_at', null)),
      expectData<any[]>(supabase.from('check_templates').select('*, equipment_types(name), check_template_sections(*, check_template_items(*))').order('updated_at', { ascending: false })),
      expectData<any[]>(supabase.from('activity_log').select('*, profiles(first_name,last_name,email)').order('created_at', { ascending: false }).limit(20)),
      expectData<any[]>(supabase.from('audit_log').select('*, profiles(first_name,last_name,email)').order('changed_at', { ascending: false }).limit(20)),
    ]);
    return { profiles, roles, clients, sites, equipment, workOrders, checks, templates, activity, audit };
  },
  async users() {
    return expectData<any[]>(supabase.from('profiles').select('*, profile_roles(roles(id,name))').order('created_at', { ascending: false }));
  },
  roles() {
    return expectData<any[]>(supabase.from('roles').select('*').order('name'));
  },
  async createProfile(payload: Record<string, any>) {
    return expectData<any>(supabase.rpc('superadmin_create_profile', { p_profile: payload }).single());
  },
  async updateProfile(profileId: string, payload: Record<string, any>) {
    return expectData<any>(supabase.rpc('superadmin_update_profile', { p_profile_id: profileId, p_profile: payload }).single());
  },
  async setRoles(profileId: string, roleNames: string[]) {
    return expectData<void>(supabase.rpc('superadmin_set_profile_roles', { p_profile_id: profileId, p_role_names: roleNames }));
  },
  async setActive(profileId: string, active: boolean) {
    return expectData<any>(supabase.rpc('superadmin_update_profile', { p_profile_id: profileId, p_profile: { active } }).single());
  },
  templates() {
    return expectData<any[]>(supabase.from('check_templates').select('*, equipment_types(name), check_template_sections(*, check_template_items(*))').order('updated_at', { ascending: false }));
  },
  toggleTemplate(templateId: string, active: boolean) {
    return expectData<any>(supabase.from('check_templates').update({ active }).eq('id', templateId).select().single());
  },
  audit() {
    return expectData<any[]>(supabase.from('audit_log').select('*, profiles(first_name,last_name,email)').order('changed_at', { ascending: false }).limit(100));
  },
};
