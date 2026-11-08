import { supabase } from '../lib/supabase/client';
import { expectData } from './query';
export type DeletableRecordKind = 'alert' | 'vehicle' | 'document' | 'deficiency';
export const recordDeletionService = {
 remove(kind: DeletableRecordKind, id: string) {
  if (kind === 'deficiency') return expectData<void>(supabase.rpc('dmp_delete_deficiency', { p_id: id }));
  return expectData<void>(supabase.rpc('dmp_delete_operational_record', { p_kind: kind, p_id: id }));
 },
};
