import { supabase } from '../lib/supabase/client';

export const authAdminService = {
  async inviteProfile(profileId: string) {
    const { data, error } = await supabase.functions.invoke('admin-user-lifecycle', {
      body: { action: 'invite_profile', profile_id: profileId },
    });
    if (error) throw new Error('No se ha podido enviar la invitacion Auth.');
    return data as { status: 'linked' | 'already_linked'; profile_id: string };
  },
};
