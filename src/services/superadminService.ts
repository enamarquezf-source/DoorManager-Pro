import { supabase } from '../lib/supabase/client';
import { normalizedRoleNames } from '../auth/permissions';
import { currentCompanyId, expectData } from './query';

export const superadminService = {
  async operatingCompany() {
    const companyId = await currentCompanyId();
    return expectData<any>(supabase.from('companies').select('*').eq('id', companyId).single());
  },
  updateOperatingCompany(payload: Record<string, any>) {
    return expectData<any>(supabase.from('companies').update(companyPayload(payload)).eq('id', payload.id).select().single());
  },
  async overview() {
    const companyId = await currentCompanyId();
    const [companies, profiles, roles, clients, sites, equipment, workOrders, checks, activity, audit] = await Promise.all([
      expectData<any[]>(supabase.from('companies').select('*').eq('id', companyId)),
      expectData<any[]>(supabase.from('profiles').select('*').eq('company_id', companyId)),
      expectData<any[]>(supabase.from('roles').select('*').order('name')),
      expectData<any[]>(supabase.from('clients').select('*').eq('company_id', companyId)),
      expectData<any[]>(supabase.from('sites').select('*').eq('company_id', companyId)),
      expectData<any[]>(supabase.from('equipment').select('*').eq('company_id', companyId)),
      expectData<any[]>(supabase.from('work_orders').select('*').eq('company_id', companyId)),
      expectData<any[]>(supabase.from('checks').select('*').eq('company_id', companyId)),
      expectData<any[]>(supabase.from('activity_log').select('*').eq('company_id', companyId).order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('audit_log').select('*').eq('company_id', companyId).order('changed_at', { ascending: false })),
    ]);
    const profileRoles = profiles.length
      ? await expectData<any[]>(supabase.from('profile_roles').select('profile_id,roles!profile_roles_role_id_fkey(name)').in('profile_id', profiles.map((profile) => profile.id)))
      : [];
    const scopedProfiles = profiles.map((profile) => ({
      ...profile,
      profile_roles: profileRoles.filter((item) => item.profile_id === profile.id),
    }));
    return {
      roles,
      templates: [],
      companies,
      profiles: scopedProfiles,
      clients,
      sites,
      equipment,
      workOrders,
      checks,
      activity,
      audit,
    };
  },
  async users() {
    try {
      const profiles = await expectData<any[]>(supabase.rpc('dmp_admin_list_users'), { service: 'superadminService', operation: 'Listado de usuarios', resource: 'profiles' });
      if (!profiles.length) return profiles;
      const profileRoles = await expectData<any[]>(supabase.from('profile_roles').select('profile_id,roles!profile_roles_role_id_fkey(name)').in('profile_id', profiles.map((profile) => profile.id)), { service: 'superadminService', operation: 'Roles del listado de usuarios', resource: 'profile_roles' });
      return profiles.map((profile) => ({ ...profile, profile_roles: profileRoles.filter((item) => item.profile_id === profile.id) }));
    } catch {
      throw new Error('No se ha podido cargar la gestión de usuarios. Inténtalo de nuevo.');
    }
  },
  roles() {
    return expectData<any[]>(supabase.from('roles').select('*').order('name'));
  },
  async createProfile(payload: Record<string, any>) {
    return this.saveProfileWithRoles(null, payload, payload.roles ?? []);
  },
  async saveProfileWithRoles(profileId: string | null, payload: Record<string, any>, roleNames: string[]) {
    const roles = normalizedRoleNames(undefined, roleNames as any);
    const normalizedPayload = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'primary_area' && key !== 'roles'));
    return expectData<any>(supabase.rpc('superadmin_save_profile_with_roles', { p_profile_id: profileId, p_profile: normalizedPayload, p_role_names: roles }).single());
  },
  async updateProfile(profileId: string, payload: Record<string, any>) {
    return this.saveProfileWithRoles(profileId, payload, payload.roles ?? []);
  },
  async setRoles(profileId: string, roleNames: string[]) {
    return this.saveProfileWithRoles(profileId, {}, roleNames);
  },
  async setActive(profileId: string, active: boolean) {
    return this.saveProfileWithRoles(profileId, { active }, []);
  },
  async templates(companyScope?: string | null) {
    const companyId = companyScope === undefined ? await currentCompanyId() : companyScope;
    let query = supabase.from('check_templates').select('*, companies!check_templates_company_id_fkey(name), equipment_types!check_templates_equipment_type_id_fkey(name), check_template_sections!check_template_sections_template_id_fkey(*, check_template_items!check_template_items_section_id_fkey(*))').order('updated_at', { ascending: false });
    if (companyId) query = query.eq('company_id', companyId);
    return expectData<any[]>(query);
  },
  async createTemplate(payload: Record<string, any>) {
    return expectData<any>(supabase.from('check_templates').insert(templatePayload({ ...payload, company_id: payload.company_id || await currentCompanyId() })).select().single());
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
  async deleteSection(sectionId: string) {
    const used = await expectData<any[]>(supabase.from('check_section_results').select('id').eq('section_id', sectionId).limit(1));
    if (used.length) throw new Error('No se puede eliminar el bloque porque ya tiene resultados de checks asociados. Desactiva o duplica la plantilla antes de modificar su estructura histórica.');
    return expectData<any>(supabase.from('check_template_sections').delete().eq('id', sectionId));
  },
  createItem(section_id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('check_template_items').insert({ section_id, title: payload.title, component: payload.component || payload.title, position: Number(payload.position), mandatory: payload.mandatory ?? true }).select().single());
  },
  updateItem(itemId: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('check_template_items').update({ title: payload.title, component: payload.component || payload.title, position: Number(payload.position), mandatory: payload.mandatory ?? true }).eq('id', itemId).select().single());
  },
  async deleteItem(itemId: string) {
    const used = await expectData<any[]>(supabase.from('check_item_results').select('id').eq('item_id', itemId).limit(1));
    if (used.length) throw new Error('No se puede eliminar el ítem porque ya tiene resultados de checks asociados. Desactiva o duplica la plantilla antes de modificar su estructura histórica.');
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
  async audit() {
    const companyId = await currentCompanyId();
    let query = supabase.from('audit_log').select('*, companies!audit_log_company_id_fkey(name), profiles!audit_log_changed_by_fkey(first_name,last_name,email)').order('changed_at', { ascending: false }).limit(100);
    query = query.eq('company_id', companyId);
    return expectData<any[]>(query);
  },
};

function companyPayload(payload: Record<string, any>) {
  const fields = ['name', 'trade_name', 'tax_id', 'address', 'postal_code', 'city', 'province', 'country', 'phone', 'email', 'website', 'logo_url', 'fiscal_notes'];
  return Object.fromEntries(fields.filter((key) => key in payload).map((key) => [key, payload[key] === '' ? null : payload[key]]));
}

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
