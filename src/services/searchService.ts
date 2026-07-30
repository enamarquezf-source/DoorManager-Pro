import { clientsService } from './clientsService';
import { equipmentService } from './equipmentService';
import { workOrdersService } from './workOrdersService';
import { supabase } from '../lib/supabase/client';
import { expectData } from './query';

export type SearchResult = { id: string; kind: string; title: string; subtitle: string; route: string };

function globalResult(item: any): SearchResult {
  if (item.legal_name) return { id: item.id, kind: 'Cliente', title: item.legal_name, subtitle: item.trade_name ?? item.code ?? '', route: `/app/clientes/${item.id}` };
  if (item.equipment_type_id) return { id: item.id, kind: 'Equipo', title: item.code, subtitle: item.model ?? item.clients?.legal_name ?? '', route: `/app/equipos/${item.id}` };
  return { id: item.id, kind: 'Parte', title: item.code ?? item.title, subtitle: item.client_name ?? item.title ?? '', route: `/app/partes/${item.id}` };
}

export const searchService = {
  async global(search: string) {
    const [clients, equipment, workOrders] = await Promise.all([clientsService.list(search), equipmentService.list(search), workOrdersService.list(search)]);
    return [...clients, ...equipment, ...workOrders].map(globalResult);
  },
  technician(search: string) {
    return expectData<SearchResult[]>(supabase.rpc('technician_global_search', { p_query: search }));
  },
};
