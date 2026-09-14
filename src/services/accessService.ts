import { supabase } from '../lib/supabase/client';
import { expectData } from './query';

export const accessService = {
  async get(profileId: string) {
    try {
      return await expectData<any>(supabase.rpc('dmp_admin_get_user_access', { p_profile_id: profileId }), { service: 'accessService', operation: 'Acceso del usuario', resource: profileId });
    } catch {
      throw new Error('No se han podido cargar los permisos y la visibilidad. Inténtalo de nuevo.');
    }
  },
  update(profileId: string, roles: string[] | null, grants: { code: string; granted: boolean }[], visibility: { code: string; visible: boolean }[]) {
    return expectData<any>(supabase.rpc('dmp_admin_update_user_access', {
      p_profile_id: profileId,
      p_role_names: roles,
      p_permission_grants: grants,
      p_module_visibility: visibility,
    }), { service: 'accessService', operation: 'Actualizar acceso del usuario', resource: profileId });
  },
};
