import { supabase } from '../lib/supabase/client';
import { expectData } from './query';
export type DeletableRecordKind = 'alert' | 'vehicle' | 'document';
export const recordDeletionService = {
 remove(kind: DeletableRecordKind, id: string) {
  return expectData<void>(supabase.rpc('dmp_delete_operational_record', { p_kind: kind, p_id: id }));
 },
};
