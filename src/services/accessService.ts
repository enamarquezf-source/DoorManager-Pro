import { supabase } from '../lib/supabase/client';
import { expectData } from './query';

export const accessService = {
  get(profileId: string) {
    return expectData<any>(supabase.rpc('dmp_admin_get_user_access', { p_profile_id: profileId }));
  },
  update(profileId: string, roles: string[] | null, grants: { code: string; granted: boolean }[], visibility: { code: string; visible: boolean }[]) {
    return expectData<any>(supabase.rpc('dmp_admin_update_user_access', {
      p_profile_id: profileId,
      p_role_names: roles,
      p_permission_grants: grants,
      p_module_visibility: visibility,
    }));
  },
};
