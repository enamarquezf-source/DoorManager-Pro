import { supabase } from '../lib/supabase/client';
import { currentCompanyId, expectData } from './query';

export const managementService = {
  metrics() {
    return expectData<any[]>(supabase.from('v_management_metrics').select('*'));
  },
  async salesData() {
    const companyId = await currentCompanyId();
    const [opportunities, quotes] = await Promise.all([
      expectData<any[]>(supabase.from('opportunities').select('*, clients!opportunities_client_id_fkey(code,legal_name), sites!opportunities_site_id_fkey(code,name), equipment!opportunities_equipment_id_fkey(code), profiles!opportunities_responsible_profile_id_fkey(first_name,last_name)').eq('company_id', companyId).is('deleted_at', null).order('created_at', { ascending: false })),
      expectData<any[]>(supabase.from('quotes').select('*, clients!quotes_client_id_fkey(code,legal_name), opportunities!quotes_opportunity_id_fkey(code,title), profiles!quotes_created_by_fkey(first_name,last_name)').eq('company_id', companyId).is('deleted_at', null).order('issue_date', { ascending: false })),
    ]);
    return { opportunities, quotes };
  },
};
