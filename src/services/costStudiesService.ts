import { supabase } from '../lib/supabase/client';
import { currentProfileCompanyId, expectData } from './query';
import { validateStudyInputs, type StudyInputs, type StudySources } from '../shared/costStudy';

export type SavedCostStudy = { id: string; title: string; period_from: string; period_to: string; inputs: StudyInputs; sources: StudySources; calculation_version: number; created_at: string };
export const costStudiesService = {
  async preview(from: string, to: string) {
    return expectData<StudySources>(supabase.rpc('dmp_cost_study_sources', { p_from: from, p_to: to }), { service: 'costStudiesService', operation: 'cargar costes del periodo' });
  },
  async list() {
    const companyId = await currentProfileCompanyId();
    return expectData<Pick<SavedCostStudy, 'id' | 'title' | 'period_from' | 'period_to' | 'created_at'>[]>(supabase.from('cost_productivity_studies').select('id,title,period_from,period_to,created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(100), { service: 'costStudiesService', operation: 'consultar estudios guardados' });
  },
  async get(id: string) {
    const companyId = await currentProfileCompanyId();
    return expectData<SavedCostStudy>(supabase.from('cost_productivity_studies').select('*').eq('company_id', companyId).eq('id', id).single(), { service: 'costStudiesService', operation: 'abrir estudio guardado' });
  },
  async save(id: string, title: string, from: string, to: string, inputs: StudyInputs) {
    validateStudyInputs(inputs, from, to);
    return expectData<string>(supabase.rpc('dmp_save_cost_study', { p_id: id, p_title: title, p_from: from, p_to: to, p_inputs: inputs }), { service: 'costStudiesService', operation: 'guardar estudio de costes' });
  },
};
