import { supabase } from '../lib/supabase/client';
import type { Profile, RoleName } from '../shared/types';
import { expectData } from './query';

export const profilesService = {
  async getCurrentProfile(): Promise<Profile> {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) throw new Error('No hay sesión activa.');
    const profile = await expectData<any>(supabase.from('profiles').select('*').eq('auth_user_id', user.id).maybeSingle());
    if (!profile) throw new Error('No hay un perfil enlazado a esta sesión.');
    if (!profile.active || profile.deleted_at) throw new Error('Usuario desactivado. Contacta con el administrador.');
    const roles = await expectData<any[]>(supabase.from('profile_roles').select('roles(name)').eq('profile_id', profile.id));
    return { ...profile, roles: roles.map((row) => row.roles?.name).filter(Boolean) as RoleName[] };
  },
  listTechnicians() {
    return expectData<any[]>(supabase.from('profiles').select('*, profile_roles!inner(roles!inner(name))').eq('profile_roles.roles.name', 'Tecnico').eq('active', true).order('first_name'));
  },
  listActive() {
    return expectData<any[]>(supabase.from('profiles').select('*').eq('active', true).order('first_name'));
  },
};
