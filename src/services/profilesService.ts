import { supabase } from '../lib/supabase/client';
import type { Profile, RoleName } from '../shared/types';
import { currentCompanyId, expectData } from './query';

export const profilesService = {
  async getCurrentProfile(): Promise<Profile> {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) throw new Error('No hay sesión activa.');
    const profile = await expectData<any>(supabase.from('profiles').select('*').eq('auth_user_id', user.id).maybeSingle(), { service: 'profilesService', operation: 'Perfil actual', resource: 'profiles' });
    if (!profile) throw new Error('No hay un perfil enlazado a esta sesión.');
    if (!profile.active || profile.deleted_at) throw new Error('Usuario desactivado. Contacta con el administrador.');
    const roles = await expectData<any[]>(supabase.from('profile_roles').select('roles!profile_roles_role_id_fkey(name)').eq('profile_id', profile.id), { service: 'profilesService', operation: 'Roles del perfil actual', resource: 'profile_roles' });
    return { ...profile, roles: roles.map((row) => row.roles?.name).filter(Boolean) as RoleName[] };
  },
  async listTechnicians(companyScope?: string | null) {
    const companyId = companyScope === undefined ? await currentCompanyId() : companyScope;
    let query = supabase.from('profiles').select('*, profile_roles!profile_roles_profile_id_fkey(roles!profile_roles_role_id_fkey(name))').eq('active', true).is('deleted_at', null).order('first_name');
    if (companyId) query = query.eq('company_id', companyId);
    const rows = await expectData<any[]>(query, { service: 'profilesService', operation: 'Listado de tecnicos', resource: 'profiles' });
    return rows.filter((row) => row.primary_area === 'Tecnico' || row.profile_roles?.some((item: any) => item.roles?.name === 'Tecnico'));
  },
  async listCommercials(companyScope?: string | null) {
    const companyId = companyScope === undefined ? await currentCompanyId() : companyScope;
    let query = supabase.from('profiles').select('*, profile_roles!profile_roles_profile_id_fkey(roles!profile_roles_role_id_fkey(name))').eq('active', true).is('deleted_at', null).order('first_name');
    if (companyId) query = query.eq('company_id', companyId);
    const rows = await expectData<any[]>(query, { service: 'profilesService', operation: 'Listado de comerciales', resource: 'profiles' });
    return rows.filter((row) => row.primary_area === 'Comercial' || row.profile_roles?.some((item: any) => item.roles?.name === 'Comercial'));
  },
  async listActive(companyScope?: string | null) {
    const companyId = companyScope === undefined ? await currentCompanyId() : companyScope;
    let query = supabase.from('profiles').select('*, profile_roles!profile_roles_profile_id_fkey(roles!profile_roles_role_id_fkey(name))').eq('active', true).is('deleted_at', null).order('first_name');
    if (companyId) query = query.eq('company_id', companyId);
    return expectData<any[]>(query);
  },
};
