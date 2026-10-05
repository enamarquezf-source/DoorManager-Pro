import { clientsService } from './clientsService';
import { equipmentService } from './equipmentService';
import { workOrdersService } from './workOrdersService';
import { casesService } from './casesService';
import { supabase } from '../lib/supabase/client';
import { expectData } from './query';
import { formatClientLabel, formatEquipmentLabel } from '../shared/entityDisplayLabels';

export type SearchResult = { id: string; kind: string; title: string; subtitle: string; route: string };

function globalResult(item: any, kind: string): SearchResult {
  if (kind === 'Cliente') return { id: item.id, kind, title: formatClientLabel(item), subtitle: item.trade_name ?? '', route: `/app/clientes/${item.id}` };
  if (kind === 'Equipo') return { id: item.id, kind, title: formatEquipmentLabel(item), subtitle: item.clients?.legal_name ?? '', route: `/app/equipos/${item.id}` };
  if (kind === 'Expediente') return { id: item.id, kind, title: [item.code, item.title].filter(Boolean).join(' · '), subtitle: item.clients?.legal_name ?? item.status ?? '', route: `/app/expedientes/${item.id}` };
  return { id: item.id, kind: 'Parte', title: item.code ?? item.title, subtitle: item.client_name ?? item.title ?? '', route: `/app/partes/${item.id}` };
}

export const searchService = {
  async global(search: string) {
    const [clients, equipment, workOrders, cases] = await Promise.all([clientsService.list(search), equipmentService.list(search), workOrdersService.list(search), casesService.list(search)]);
    return [...clients.map((row) => globalResult(row, 'Cliente')), ...equipment.map((row) => globalResult(row, 'Equipo')), ...workOrders.map((row) => globalResult(row, 'Parte')), ...cases.map((row) => globalResult(row, 'Expediente'))];
  },
  technician(search: string) {
    return expectData<SearchResult[]>(supabase.rpc('technician_global_search', { p_query: search }));
  },
};
