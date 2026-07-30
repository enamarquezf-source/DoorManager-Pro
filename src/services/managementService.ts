import { supabase } from '../lib/supabase/client';
import { currentCompanyId, expectData } from './query';

export const managementService = {
  metrics() {
    return expectData<any[]>(supabase.from('v_management_metrics').select('*'));
  },
  async salesData() {
    const companyId = await currentCompanyId();
    const [opportunities, quotes] = await Promise.all([
      expectData<any[]>(supabase.from('opportunities').select('*, clients(code,legal_name), sites(code,name), equipment(code), profiles(first_name,last_name)').eq('company_id', companyId).is('deleted_at', null).order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('quotes').select('*, clients(code,legal_name), opportunities(code,title), profiles(first_name,last_name)').eq('company_id', companyId).is('deleted_at', null).order('issue_date', { ascending: false })),
    ]);
    return { opportunities, quotes };
  },
};
