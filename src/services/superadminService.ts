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
  createTemplate(payload: Record<string, any>) {
    return expectData<any>(supabase.from('check_templates').insert(templatePayload(payload)).select().single());
  },
  updateTemplate(templateId: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('check_templates').update(templatePayload(payload)).eq('id', templateId).select().single());
  },
  toggleTemplate(templateId: string, active: boolean) {
    return expectData<any>(supabase.from('check_templates').update({ active }).eq('id', templateId).select().single());
  },
  async duplicateTemplate(template: any) {
    const duplicate = await this.createTemplate({ company_id: template.company_id, equipment_type_id: template.equipment_type_id, name: `${template.name} copia`, version: nextVersion(template.version), active: false });
    for (const section of [...(template.check_template_sections ?? [])].sort(byPosition)) {
      const createdSection = await this.createSection(duplicate.id, { title: section.title, position: section.position });
      for (const item of [...(section.check_template_items ?? [])].sort(byPosition)) {
        await this.createItem(createdSection.id, { title: item.title, component: item.component, position: item.position, mandatory: item.mandatory });
      }
    }
    return duplicate;
  },
  createSection(template_id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('check_template_sections').insert({ template_id, title: payload.title, position: Number(payload.position) }).select().single());
  },
  updateSection(sectionId: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('check_template_sections').update({ title: payload.title, position: Number(payload.position) }).eq('id', sectionId).select().single());
  },
  deleteSection(sectionId: string) {
    return expectData<any>(supabase.from('check_template_sections').delete().eq('id', sectionId));
  },
  createItem(section_id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('check_template_items').insert({ section_id, title: payload.title, component: payload.component || payload.title, position: Number(payload.position), mandatory: payload.mandatory ?? true }).select().single());
  },
  updateItem(itemId: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('check_template_items').update({ title: payload.title, component: payload.component || payload.title, position: Number(payload.position), mandatory: payload.mandatory ?? true }).eq('id', itemId).select().single());
  },
  deleteItem(itemId: string) {
    return expectData<any>(supabase.from('check_template_items').delete().eq('id', itemId));
  },
  async reorderSections(sections: any[]) {
    for (let index = 0; index < sections.length; index += 1) await expectData<any>(supabase.from('check_template_sections').update({ position: 1000 + index }).eq('id', sections[index].id));
    for (let index = 0; index < sections.length; index += 1) await expectData<any>(supabase.from('check_template_sections').update({ position: index + 1 }).eq('id', sections[index].id));
  },
  async reorderItems(items: any[]) {
    for (let index = 0; index < items.length; index += 1) await expectData<any>(supabase.from('check_template_items').update({ position: 1000 + index }).eq('id', items[index].id));
    for (let index = 0; index < items.length; index += 1) await expectData<any>(supabase.from('check_template_items').update({ position: index + 1 }).eq('id', items[index].id));
  },
  audit(companyId: string | null = null) {
    let query = supabase.from('audit_log').select('*, companies(name), profiles(first_name,last_name,email)').order('changed_at', { ascending: false }).limit(100);
    if (companyId) query = query.eq('company_id', companyId);
    return expectData<any[]>(query);
  },
};

function templatePayload(payload: Record<string, any>) {
  return {
    company_id: payload.company_id || null,
    equipment_type_id: payload.equipment_type_id || null,
    name: payload.name,
    version: payload.version || '1.0',
    active: payload.active ?? true,
  };
}

function byPosition(a: any, b: any) { return (a.position ?? 0) - (b.position ?? 0); }
function nextVersion(version: string) { const match = String(version ?? '1.0').match(/^(\d+)(?:\.(\d+))?$/); return match ? `${match[1]}.${Number(match[2] ?? 0) + 1}` : `${version} copia`; }
