import { supabase } from '../lib/supabase/client';
import { expectData } from './query';
export type OperationalRegisterKind = 'vehicle' | 'prl';
export const operationalRegistersService = {
 list(kind: OperationalRegisterKind) {
  return expectData<any[]>(supabase.from(kind === 'vehicle' ? 'vehicles' : 'personnel_certificates').select('*').order(kind === 'vehicle' ? 'registration' : 'expires_on', { ascending: true, nullsFirst: false }));
 },
 save(kind: OperationalRegisterKind, payload: Record<string, any>) {
  return expectData<string>(supabase.rpc('dmp_save_operational_register', { p_kind: kind, p_payload: payload }));
 },
};
