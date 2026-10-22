import { overlayFieldCheck } from './fieldOperations';
import { documentsService } from './documentsService';
import { supabase } from '../lib/supabase/client';
import { expectData } from './query';
import { prepareOfflineShell } from '../offline/registerWorker';
import { assignmentsService } from './assignmentsService';
import { workOrdersService } from './workOrdersService';
import { checksService } from './checksService';
import { equipmentService } from './equipmentService';
import { equipmentPhotosService } from './equipmentPhotosService';
import { hourRatesService } from './hourRatesService';
import { offlineWorkspaceStore, readDeviceFirst, workspaceIdentity, assertWorkspaceIdentity, connectionAvailable } from './offlineWorkspaceStore';
import { technicianOfflineService } from './technicianOfflineService';
import { localDateKey } from '../shared/localDate';

export type PreparedJourney = {
  downloadVersion: number;
  shellAvailable: boolean;
  workOrderIds: string[];
  checkIds: string[];
  preparedAt: string;
};

export function journeyMatches(ready: PreparedJourney | undefined, rows: any[], today = localDateKey()) {
  if (!ready || ready.downloadVersion !== 2 || localDateKey(new Date(ready.preparedAt)) !== today) return false;
  const ids = [...new Set(rows.map(row => row.work_order_id))];
  return ids.length === ready.workOrderIds.length && ids.every(id => ready.workOrderIds.includes(id));
}

async function downloadMedia<T>(value: T): Promise<T> {
  if (Array.isArray(value)) return await Promise.all(value.map(downloadMedia)) as T;
  if (!value || typeof value !== 'object') return value;
  if ('file_error' in value && value.file_error) throw new Error('No se ha podido descargar un archivo vinculado. Revisa el archivo o reintenta con cobertura.');
  const result: any = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'signed_url' && typeof item === 'string' && /^https?:/.test(item)) {
      const response = await fetch(item, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error('No se ha podido descargar una foto o documento. Reintenta Preparar jornada.');
      const blob = await response.blob();
      if (blob.size > 20 * 1024 * 1024) throw new Error('Un archivo supera 20 MB. La jornada no se marcará como completamente descargada.');
      result[key] = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
      });
    } else result[key] = await downloadMedia(item);
  }
  return result;
}

export const technicianWorkspaceService = {
  day: (refresh = false) => readDeviceFirst('day', () => assignmentsService.assignedActiveWork(), refresh),
  async loadJourney(onProgress: (message: string) => void, force = false) {
    // Showing the list must prepare the whole package, not defer the download
    // until somebody happens to open each individual work order.
    const rows = await this.day();
    const cached = (await offlineWorkspaceStore.get<PreparedJourney>('ready'))?.data;
    if (!connectionAvailable()) {
      onProgress(cached ? 'Sin conexión. Abriendo la jornada descargada en este dispositivo.' : 'Sin conexión. Falta descargar la jornada completa.');
      return { rows, ready: cached ?? null };
    }
    if (!force && journeyMatches(cached, rows)) {
      onProgress('Todos los partes están descargados. Puedes abrirlos sin cobertura.');
      return { rows, ready: cached! };
    }
    let ready: PreparedJourney | null = null;
    try {
      ready = await this.prepare(onProgress);
      onProgress(ready.shellAvailable ? 'Todos los partes y sus checks están descargados. Puedes trabajar sin cobertura.' : 'Datos descargados. Usa la versión compilada para reabrir la app sin cobertura.');
    } catch (error) {
      onProgress(`Descarga incompleta. ${error instanceof Error ? error.message : 'Reintenta con cobertura.'}`);
    }
    return { rows: await this.day(), ready };
  },
  work: (id: string, refresh = false) => readDeviceFirst<any>(`work:${id}`, async () => { const work = await workOrdersService.getTechnicianAssigned(id); if (refresh) work.documents = await documentsService.linked('Parte', id); return refresh ? downloadMedia(work) : work; }, refresh),
  async check(id: string, refresh = false) { const check = await readDeviceFirst<any>(`check:${id}`, async () => { const check = await checksService.getTechnicianAssigned(id); return refresh ? downloadMedia(check) : check; }, refresh); const snapshot = await offlineWorkspaceStore.get(`check:${id}`); return overlayFieldCheck(check, await technicianOfflineService.list(), snapshot?.savedAt ?? ''); },
  workers: (id: string, refresh = false) => readDeviceFirst(`workers:${id}`, () => workOrdersService.timeWorkerOptions(id), refresh),
  photos: (id: string, refresh = false) => readDeviceFirst(`photos:${id}`, () => equipmentPhotosService.list(id), refresh),
  history: (id: string, refresh = false) => readDeviceFirst(`history:${id}`, () => equipmentService.technicianContext(id), refresh),
  costs: (refresh = false) => readDeviceFirst('cost-catalog', () => hourRatesService.catalog('', undefined, 'cost', false), refresh),
  materials: async (search = '', refresh = false) => {
    const rows = await readDeviceFirst<any[]>('materials', async () => {
      const companyId = workspaceIdentity().companyId; const rows: any[] = [];
      for (let start = 0; ; start += 500) {
        const page = await expectData<any[]>(supabase.from('materials').select('id,company_id,code,description,manufacturer,reference,unit,stock_controlled').eq('company_id', companyId).eq('active', true).is('deleted_at', null).order('id').range(start, start + 499));
        rows.push(...page); if (page.length < 500) return rows;
      }
    }, refresh);
    const text = search.trim().toLocaleLowerCase();
    return rows.filter(row => !text || [row.code, row.description, row.manufacturer, row.reference].some(value => String(value ?? '').toLocaleLowerCase().includes(text)));
  },
  warehouses: (refresh = false) => readDeviceFirst('warehouses', () => workOrdersService.warehousesCatalog(), refresh),
  stock: (refresh = false) => readDeviceFirst('stock', () => workOrdersService.warehouseStockCatalog(), refresh),
  async checks(done: boolean) {
    const [pending, completed] = await Promise.all([
      readDeviceFirst<any[]>('checks-pending', () => checksService.pendingForCurrentTechnician()),
      readDeviceFirst<any[]>('checks-done', () => checksService.completedForCurrentTechnician()),
    ]);
    const day = await this.day();
    const rows: any[] = [...pending, ...completed];
    for (const assignment of day) {
      const work: any = await this.work(assignment.work_order_id);
      for (const row of work.checks ?? []) {
        if (!rows.some(item => item.id === row.id)) rows.push({ ...row, work_order_code: work.code, client_name: work.clients?.legal_name, site_name: work.sites?.name });
      }
    }
    const closed = new Set((await technicianOfflineService.list()).filter(item => item.type === 'check-finish').map(item => item.checkId));
    return rows.map(row => closed.has(row.id) ? { ...row, status: 'Realizado', _local: true } : row).filter(row => (row.status === 'Realizado') === done);
  },
  async prepare(onProgress: (message: string) => void) {
    if (!connectionAvailable()) throw new Error('Conecta para descargar la jornada.');
    const owner = workspaceIdentity();
    const shellAvailable = await prepareOfflineShell();
    if (import.meta.env.PROD && !shellAvailable) throw new Error('No se ha podido preparar el arranque sin conexión. Reintenta con cobertura antes de salir.');
    // Remove the ready marker before doing any partial work; never imply a failed
    // download is complete. Pending edits live in a separate database.
    await offlineWorkspaceStore.remove('ready', owner);
    onProgress('Descargando partes asignados…');
    const oldDay = await offlineWorkspaceStore.get<any[]>('day', owner);
    const previous = await offlineWorkspaceStore.get<any>('manifest', owner);
    const day = await this.day(true);
    const ids = [...new Set(day.map((row: any) => row.work_order_id))];
    for (const old of oldDay?.data ?? []) if (!ids.includes(old.work_order_id)) await offlineWorkspaceStore.remove(`work:${old.work_order_id}`, owner);
    await technicianOfflineService.reconcileActiveWork(ids);
    onProgress('Descargando materiales y opciones de trabajo…');
    await Promise.all([this.materials('', true), this.warehouses(true), this.stock(true), this.costs(true)]);
    let count = 0;
    const equipment = new Set<string>();
    const checks = new Set<string>();
    const checkList = await readDeviceFirst<any[]>('checks-pending', () => checksService.pendingForCurrentTechnician(), true);
    await readDeviceFirst('checks-done', () => checksService.completedForCurrentTechnician(), true);
    for (const row of checkList) {
      const check = await this.check(row.id, true);
      checks.add(row.id);
      if (check.equipment_id) equipment.add(check.equipment_id);
    }
    for (const id of ids) {
      assertWorkspaceIdentity(owner);
      onProgress(`Preparando parte ${++count} de ${ids.length}…`);
      const work = await this.work(id, true);
      await this.workers(id, true);
      for (const row of work.checks ?? []) if (!row.deleted_at && !checks.has(row.id)) {
        const check = await this.check(row.id, true);
        checks.add(row.id);
        if (check.equipment_id) equipment.add(check.equipment_id);
      }
      for (const row of work.associated_equipment ?? []) { const item = row.equipment ?? row; if (item.id) equipment.add(item.id); }
      if (work.primary_equipment?.id) equipment.add(work.primary_equipment.id);
    }
    for (const id of equipment) {
      onProgress('Guardando fotos e historial de equipos…');
      await offlineWorkspaceStore.put(`photos:${id}`, await downloadMedia(await this.photos(id, true)), owner);
      await offlineWorkspaceStore.put(`history:${id}`, await downloadMedia(await this.history(id, true)), owner);
    }
    for (const id of previous?.data?.checkIds ?? []) if (!checks.has(id)) await offlineWorkspaceStore.remove(`check:${id}`, owner);
    await offlineWorkspaceStore.put('manifest', { checkIds: [...checks] }, owner);
    const ready: PreparedJourney = { downloadVersion: 2, shellAvailable, workOrderIds: ids, checkIds: [...checks], preparedAt: new Date().toISOString() };
    await offlineWorkspaceStore.put('ready', ready, owner);
    if ('storage' in navigator) void navigator.storage.persist?.().catch(() => false);
    return ready;
  },
};
