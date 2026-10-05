import { normalizeAlertRecipients } from '../shared/alertRecipients';
import { supabase } from '../lib/supabase/client';
import { contains, currentProfileId, expectData } from './query';

export const alertsService = {
  list(search = '') {
    let query = supabase.from('alert_recipients').select('*, alerts!alert_recipients_alert_id_fkey!inner(*)').is('alerts.deleted_at', null).order('created_at', { ascending: false });
    if (search) query = query.or(contains(['title', 'description', 'type'], search), { referencedTable: 'alerts' });
    return expectData<any[]>(query);
  },
  unread() {
    return expectData<any[]>(supabase.from('v_unread_alerts').select('*').order('alert_date', { ascending: false }), { service: 'alertsService', operation: 'Avisos no leidos', resource: 'v_unread_alerts' });
  },
  async create(payload: Record<string, any>, recipients: { role?: string; profile_id?: string }[], operationId: string) {
    const destinations = normalizeAlertRecipients(recipients);
    if (!operationId) throw new Error('Falta el identificador de la operación del aviso.');
    return expectData<any>(supabase.rpc('dmp_create_alert_atomic', {
      p_operation_id: operationId, p_payload: payload, p_recipients: destinations,
    }), { service: 'alertsService', operation: 'Crear aviso', resource: 'alerts' });
  },
  async markAsRead(recipientId: string) {
    const profileId = await currentProfileId();
    return expectData<void>(supabase.rpc('mark_alert_as_read', { p_alert_recipient_id: recipientId, p_profile_id: profileId }));
  },
  close(recipientId: string) {
    return expectData<any>(supabase.rpc('dmp_update_alert_recipient', { p_recipient_id: recipientId, p_action: 'close' }));
  },
  reopen(recipientId: string) {
    return expectData<any>(supabase.rpc('dmp_update_alert_recipient', { p_recipient_id: recipientId, p_action: 'reopen' }));
  },
  update(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('alerts').update(payload).eq('id', id).select().single());
  },
};
