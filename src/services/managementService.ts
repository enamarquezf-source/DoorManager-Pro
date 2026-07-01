import { supabase } from '../lib/supabase/client';
import { expectData } from './query';

export const managementService = {
  metrics() {
    return expectData<any[]>(supabase.from('v_management_metrics').select('*'));
  },
};
