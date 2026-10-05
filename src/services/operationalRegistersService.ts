import { supabase } from '../lib/supabase/client';
import { expectData } from './query';
export type OperationalRegisterKind = 'vehicle' | 'prl';
export const operationalRegistersService = {
 list(kind: OperationalRegisterKind) {
  return expectData<any[]>(supabase.from(kind === 'vehicle' ? 'vehicles' : 'personnel_certificates').select('*').is('deleted_at', null).order(kind === 'vehicle' ? 'registration' : 'expires_on', { ascending: true, nullsFirst: false }));
 },
 save(kind: OperationalRegisterKind, payload: Record<string, any>) {
  return expectData<string>(supabase.rpc('dmp_save_operational_register', { p_kind: kind, p_payload: payload }));
 },
 createOnce(kind: OperationalRegisterKind, operationId: string, payload: Record<string, any>) {
  if (!operationId || payload.id) throw new Error('La creación requiere una operación nueva, sin identificador de registro existente.');
  return expectData<string>(supabase.rpc('dmp_create_operational_register_once', { p_operation_id: operationId, p_kind: kind, p_payload: payload }));
 },
};
