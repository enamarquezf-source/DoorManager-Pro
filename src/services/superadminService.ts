import { supabase } from '../lib/supabase/client';
import { expectData } from './query';

export const superadminService = {
  companies() {
    return expectData<any[]>(supabase.from('companies').select('*').order('name'));
  },
  async overview(companyId: string | null = null) {
    const overview = await expectData<any>(supabase.rpc('superadmin_global_overview', { p_company_id: companyId }));
    const roles = await expectData<any[]>(supabase.from('roles').select('*').order('name'));
    return {
      ...overview,
      roles,
      templates: [],
      companies: overview.companies ?? [],
      profiles: overview.profiles ?? [],
      clients: overview.clients ?? [],
      sites: overview.sites ?? [],
      equipment: overview.equipment ?? [],
      workOrders: overview.work_orders ?? [],
      checks: overview.checks ?? [],
      activity: overview.activity ?? [],
      audit: overview.audit ?? [],
    };
  },
  async users(companyId: string | null = null) {
    let query = supabase.from('profiles').select('*, companies(name), profile_roles(roles(id,name))').order('created_at', { ascending: false });
    if (companyId) query = query.eq('company_id', companyId);
    return expectData<any[]>(query);
  },
  roles() {
    return expectData<any[]>(supabase.from('roles').select('*').order('name'));
  },
  async createProfile(payload: Record<string, any>) {
    return expectData<any>(supabase.rpc('superadmin_create_profile', { p_profile: payload }).single());
  },
  async saveProfileWithRoles(profileId: string | null, payload: Record<string, any>, roleNames: string[]) {
    return expectData<any>(supabase.rpc('superadmin_save_profile_with_roles', { p_profile_id: profileId, p_profile: payload, p_role_names: roleNames }).single());
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
  async softDeleteProfile(profileId: string) {
    return expectData<any>(supabase.rpc('superadmin_update_profile', { p_profile_id: profileId, p_profile: { deleted_at: new Date().toISOString(), active: false } }).single());
  },
  templates(companyId: string | null = null) {
    let query = supabase.from('check_templates').select('*, companies(name), equipment_types(name), check_template_sections(*, check_template_items(*))').order('updated_at', { ascending: false });
    if (companyId) query = query.eq('company_id', companyId);
    return expectData<any[]>(query);
  },
  toggleTemplate(templateId: string, active: boolean) {
    return expectData<any>(supabase.from('check_templates').update({ active }).eq('id', templateId).select().single());
  },
  audit(companyId: string | null = null) {
    let query = supabase.from('audit_log').select('*, companies(name), profiles(first_name,last_name,email)').order('changed_at', { ascending: false }).limit(100);
    if (companyId) query = query.eq('company_id', companyId);
    return expectData<any[]>(query);
  },
};
