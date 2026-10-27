import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
const remote = vi.hoisted(() => ({ day: vi.fn(), work: vi.fn(), check: vi.fn(), pending: vi.fn(), done: vi.fn(), workers: vi.fn(), photos: vi.fn(), history: vi.fn(), costs: vi.fn(), warehouses: vi.fn(), stock: vi.fn() }));
vi.mock('./documentsService', () => ({ documentsService: { linked: async () => [] } }));
vi.mock('./assignmentsService', () => ({ assignmentsService: { assignedActiveWork: remote.day } }));
vi.mock('./workOrdersService', () => ({ workOrdersService: { getTechnicianAssigned: remote.work, timeWorkerOptions: remote.workers, warehousesCatalog: remote.warehouses, warehouseStockCatalog: remote.stock, technicianStockOptions: async()=>({warehouses:await remote.warehouses(),stock:await remote.stock()}) } }));
vi.mock('./checksService', () => ({ checksService: { getTechnicianAssigned: remote.check, pendingForCurrentTechnician: remote.pending, completedForCurrentTechnician: remote.done } }));
vi.mock('./equipmentPhotosService', () => ({ equipmentPhotosService: { list: remote.photos } }));
vi.mock('./equipmentService', () => ({ equipmentService: { technicianContext: remote.history } }));
vi.mock('./hourRatesService', () => ({ hourRatesService: { catalog: remote.costs } }));
vi.mock('./technicianOfflineService', () => ({ technicianOfflineService: { reconcileActiveWork: vi.fn(), list: async () => [] } }));
vi.mock('../offline/registerWorker', () => ({ prepareOfflineShell: async () => true }));
vi.mock('../lib/supabase/client', () => ({ supabase: {} }));
import { technicianWorkspaceService as workspace, journeyMatches } from './technicianWorkspaceService';
import { offlineWorkspaceStore, setWorkspaceIdentity } from './offlineWorkspaceStore';
import { localDateKey } from '../shared/localDate';

beforeEach(() => {
  vi.restoreAllMocks();
  Object.values(remote).forEach(mock => mock.mockReset());
  setWorkspaceIdentity({ companyId: 'company', profileId: crypto.randomUUID() });
  vi.stubGlobal('navigator', { onLine: true });
  remote.day.mockResolvedValue([{ work_order_id: 'work' }]);
  remote.work.mockResolvedValue({ id: 'work', checks: [{ id: 'check' }], associated_equipment: [] });
  remote.check.mockResolvedValue({ id: 'check', check_templates: { check_template_sections: [{ id: 'section', check_template_items: [{ id: 'motor' }] }] } });
  remote.pending.mockResolvedValue([{ id: 'check' }]); remote.done.mockResolvedValue([]);
  remote.workers.mockResolvedValue([{ profile_id: 'worker' }]);
  remote.costs.mockResolvedValue([]); remote.warehouses.mockResolvedValue([]); remote.stock.mockResolvedValue([]);
  vi.spyOn(workspace, 'materials').mockResolvedValue([]);
});
it('prepares a complete journey and reopens its part and exact check template offline', async () => {
  const result = await workspace.prepare(vi.fn());
  expect(result.workOrderIds).toEqual(['work']);
  expect(result.checkIds).toEqual(['check']);
  vi.stubGlobal('navigator', { onLine: false });
  remote.work.mockRejectedValue(new Error('Must not request network'));
  remote.check.mockRejectedValue(new Error('Must not request network'));
  expect((await workspace.work('work')).id).toBe('work');
  expect((await workspace.check('check')).check_templates.check_template_sections[0].check_template_items[0].id).toBe('motor');
  expect((await offlineWorkspaceStore.get<any>('ready'))?.data.preparedAt).toBeTruthy();
});
it('never marks a partial download as available offline', async () => {
  remote.workers.mockRejectedValueOnce(new Error('Download interrupted'));
  await expect(workspace.prepare(vi.fn())).rejects.toThrow('interrupted');
  expect(await offlineWorkspaceStore.get('ready')).toBeUndefined();
});

it('automatically downloads every part and its unseen checks before enabling the journey', async () => {
  remote.day.mockResolvedValue([{ work_order_id: 'one' }, { work_order_id: 'two' }]);
  remote.pending.mockResolvedValue([]);
  remote.work.mockImplementation(async (id: string) => ({ id, checks: [{ id: `check-${id}` }], primary_equipment: { id: `equipment-${id}` } }));
  remote.check.mockImplementation(async (id: string) => ({ id, check_templates: { check_template_sections: [{ id: `section-${id}`, check_template_items: [{ id: `motor-${id}` }] }] } }));
  remote.photos.mockResolvedValue([{ signed_url: 'data:image/png;base64,downloaded-photo' }]);
  let finishLastFile!: (value: any) => void;
  remote.history.mockImplementation((id: string) => id === 'equipment-two'
    ? new Promise(resolve => { finishLastFile = resolve; })
    : Promise.resolve({ workOrders: [], deficiencies: [] }));
  const progress = vi.fn();
  const enabled = vi.fn();
  const loading = workspace.loadJourney(progress).then(result => { enabled(result.ready); return result; });
  await vi.waitFor(() => expect(finishLastFile).toBeTypeOf('function'));
  expect(remote.work).toHaveBeenCalledTimes(2);
  expect(remote.check).toHaveBeenCalledTimes(2);
  expect(await offlineWorkspaceStore.get('ready')).toBeUndefined();
  expect(enabled).not.toHaveBeenCalled();
  finishLastFile({ workOrders: [], deficiencies: [] });
  const result = await loading;
  expect(result.rows).toHaveLength(2);
  expect(result.ready?.workOrderIds).toEqual(['one', 'two']);
  expect(progress).toHaveBeenCalledWith('Preparando parte 2 de 2…');
  vi.stubGlobal('navigator', { onLine: false });
  const callsBeforeOpening = Object.values(remote).map(mock => mock.mock.calls.length);
  for (const id of ['one', 'two']) {
    expect((await workspace.work(id)).id).toBe(id);
    expect((await workspace.check(`check-${id}`)).check_templates.check_template_sections[0].check_template_items[0].id).toBe(`motor-check-${id}`);
    expect(await workspace.workers(id)).toHaveLength(1);
    expect((await workspace.photos(`equipment-${id}`))[0].signed_url).toContain('data:image');
    expect(await workspace.history(`equipment-${id}`)).toEqual({ workOrders: [], deficiencies: [] });
  }
  expect(Object.values(remote).map(mock => mock.mock.calls.length)).toEqual(callsBeforeOpening);
});

it('reuses a complete current journey without downloading it on every visit', async () => {
  await workspace.loadJourney(vi.fn());
  const download = vi.spyOn(workspace, 'prepare');
  const result = await workspace.loadJourney(vi.fn());
  expect(download).not.toHaveBeenCalled();
  expect(result.ready?.workOrderIds).toEqual(['work']);
  // The ready state travels with the cached list, so remounting a fresh query
  // cannot show disabled cards merely because its loader wasn't called again.
  expect(structuredClone(result).ready?.workOrderIds).toEqual(['work']);
  vi.stubGlobal('navigator', { onLine: false });
  const offline = await workspace.loadJourney(vi.fn());
  expect(offline.ready?.workOrderIds).toEqual(['work']);
  expect(download).not.toHaveBeenCalled();
});

it('refreshes every assigned part when explicitly updating an already downloaded journey', async () => {
  await workspace.loadJourney(vi.fn());
  remote.day.mockResolvedValue([{ work_order_id: 'new-work' }]);
  remote.work.mockResolvedValue({ id: 'new-work', checks: [], associated_equipment: [] });
  const result = await workspace.loadJourney(vi.fn(), true);
  expect(result.ready?.workOrderIds).toEqual(['new-work']);
  expect(result.rows[0].work_order_id).toBe('new-work');
  expect(remote.work).toHaveBeenCalledWith('new-work');
});

it('shows an incomplete download and does not enable parts after failure', async () => {
  remote.workers.mockRejectedValueOnce(new Error('Download interrupted'));
  const progress = vi.fn();
  const result = await workspace.loadJourney(progress);
  expect(result.rows).toHaveLength(1);
  expect(result.ready).toBeNull();
  expect(progress.mock.lastCall?.[0]).toContain('Descarga incompleta');
  expect(await offlineWorkspaceStore.get('ready')).toBeUndefined();
});

it('invalidates preparation when assignments change or an older package is found', () => {
  const ready = { downloadVersion: 2, shellAvailable: true, workOrderIds: ['one'], checkIds: [], preparedAt: new Date().toISOString() };
  expect(journeyMatches(ready, [{ work_order_id: 'one' }])).toBe(true);
  expect(journeyMatches(ready, [{ work_order_id: 'one' }, { work_order_id: 'two' }])).toBe(false);
  expect(journeyMatches({ ...ready, downloadVersion: 1 }, [{ work_order_id: 'one' }])).toBe(false);
  expect(journeyMatches(ready, [{ work_order_id: 'one' }], localDateKey(new Date(Date.now() + 86400000)))).toBe(false);
});

it('refreshes a cached demo journey when the role transition expects a newly assigned work',async()=>{
await workspace.loadJourney(vi.fn());remote.day.mockResolvedValue([{work_order_id:'work'},{work_order_id:'new-work'}]);remote.work.mockImplementation(async(id:string)=>({id,checks:[],associated_equipment:[]}));remote.pending.mockResolvedValue([]);
const result=await workspace.loadJourney(vi.fn(),false,'new-work');expect(result.rows.map((row:any)=>row.work_order_id)).toEqual(['work','new-work']);expect(result.ready?.workOrderIds).toContain('new-work');expect((await offlineWorkspaceStore.get<any>('work:new-work'))?.data.id).toBe('new-work');
});
it('keeps the downloaded journey available offline even if another work is expected',async()=>{
await workspace.loadJourney(vi.fn());const calls=remote.day.mock.calls.length;vi.stubGlobal('navigator',{onLine:false});const result=await workspace.loadJourney(vi.fn(),false,'not-downloaded');expect(result.ready?.workOrderIds).toEqual(['work']);expect(remote.day.mock.calls).toHaveLength(calls);
});
