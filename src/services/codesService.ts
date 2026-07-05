import { supabase } from '../lib/supabase/client';
import { currentCompanyId } from './query';

function normalize(value?: string | null) {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function equipmentPrefix(typeName?: string | null) {
  const type = normalize(typeName);
  if (type.includes('barrera')) return 'EQ-BAR';
  if (type.includes('rapida')) return 'EQ-RAP';
  if (type.includes('enrollable')) return 'EQ-ENR';
  if (type.includes('corredera')) return 'EQ-COR';
  if (type.includes('batiente')) return 'EQ-BAT';
  if (type.includes('muelle')) return 'EQ-MUE';
  if (type.includes('abrigo')) return 'EQ-ABR';
  if (type.includes('peatonal')) return 'EQ-PEA';
  if (type.includes('cancela') || type.includes('porton')) return 'EQ-CAN';
  return 'EQ-SEC';
}

export const codesService = {
  async next(tableName: string, prefix: string, yearly = false, width = 6) {
    const companyId = await currentCompanyId();
    const { data, error } = await supabase.rpc('next_dmp_code', { p_company_id: companyId, p_table_name: tableName, p_prefix: prefix, p_yearly: yearly, p_width: width });
    if (error || !data) throw new Error('No se ha podido generar el código automático. Inténtalo de nuevo.');
    return data as string;
  },
  async equipment(typeId: string) {
    const { data, error } = await supabase.from('equipment_types').select('name').eq('id', typeId).maybeSingle();
    if (error) throw new Error('No se ha podido leer el tipo de equipo para generar el código.');
    return this.next('equipment', equipmentPrefix(data?.name), false, 6);
  },
};
