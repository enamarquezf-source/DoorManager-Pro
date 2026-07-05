import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, currentProfileId, expectData } from './query';
import { codesService } from './codesService';

export const alertsService = {
  list(search = '') {
    let query = supabase.from('alert_recipients').select('*, alerts!alert_recipients_alert_id_fkey(*)').order('created_at', { ascending: false });
    if (search) query = query.or(contains(['alerts.title', 'alerts.description', 'alerts.type'], search));
    return expectData<any[]>(query);
  },
  unread() {
    return expectData<any[]>(supabase.from('v_unread_alerts').select('*').order('alert_date', { ascending: false }));
  },
  async create(payload: Record<string, any>, recipients: { role?: string; profile_id?: string }[]) {
    const company_id = await currentCompanyId();
    const created_by = await currentProfileId();
    const code = await codesService.next('alerts', 'AVI', true);
    const alert = await expectData<any>(supabase.from('alerts').insert({ ...payload, company_id, created_by, code }).select().single());
    if (recipients.length) await supabase.from('alert_recipients').insert(recipients.map((item) => ({ company_id, alert_id: alert.id, recipient_role: item.role, recipient_profile_id: item.profile_id })));
    return alert;
  },
  async markAsRead(recipientId: string) {
    const profileId = await currentProfileId();
    return expectData<void>(supabase.rpc('mark_alert_as_read', { p_alert_recipient_id: recipientId, p_profile_id: profileId }));
  },
  close(recipientId: string) {
    return expectData<any>(supabase.from('alert_recipients').update({ closed_at: new Date().toISOString(), is_read: true }).eq('id', recipientId).select().single());
  },
  reopen(recipientId: string) {
    return expectData<any>(supabase.from('alert_recipients').update({ closed_at: null }).eq('id', recipientId).select().single());
  },
  update(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('alerts').update(payload).eq('id', id).select().single());
  },
};
