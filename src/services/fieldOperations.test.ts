import { expect, it, vi } from 'vitest';
vi.mock('./technicianOfflineService', () => ({ technicianOfflineService: {} }));
import { overlayFieldWork, overlayFieldCheck } from './fieldOperations';
const change = (type: string, payload: any, id = 'operation') => ({ id, type, payload, workOrderId: 'work', status: 'pending', createdAt: '2026-10-22T12:00:00Z' }) as any;
it('reconstructs local hours, materials, photos, signatures and check closures after reopening', () => {
  const original = { id: 'work', time_entries: [], checks: [{ id: 'check', status: 'Por realizar' }] };
  const work = overlayFieldWork(original, [change('time', { duration_minutes: 90 }), change('material-entry', { description: 'Motor', quantity: 2 }), change('photo', { dataUrl: 'data:photo' }), change('signature', { dataUrl: 'data:signature' }), { ...change('check-finish', {}), checkId: 'check' }], null, '2026-10-21');
  expect(work.time_entries[0].duration_minutes).toBe(90);
  expect(work.materials[0].used_quantity).toBe(2);
  expect(work.photos[0].signed_url).toBe('data:photo');
  expect(work.signatures[0].signed_url).toBe('data:signature');
  expect(work.checks[0].status).toBe('Realizado');
  expect(original.time_entries).toEqual([]);
});
it('does not duplicate a sent record after refreshing the snapshot', () => {
  const sent = { ...change('time', { duration_minutes: 30 }), status: 'synced' };
  const work = overlayFieldWork({ id: 'work', time_entries: [{ id: 'server', duration_minutes: 30 }] }, [sent], null, '2026-10-22T13:00:00Z');
  expect(work.time_entries).toHaveLength(1);
});

it('preserves confirmed check results and photos if the network drops before refreshing', () => {
  const sent = { ...change('check-block', { sectionId: 'section', persistedStatus: 'Problema leve', items: [{ id: 'motor', result: 'Problema leve', observations: 'Ruido' }] }), checkId: 'check', status: 'synced', updatedAt: '2026-10-22T14:00:00Z' };
  const photo = { ...change('photo', { sectionId: 'section', itemId: 'motor', dataUrl: 'data:photo' }, 'photo'), checkId: 'check', status: 'synced', updatedAt: sent.updatedAt };
  const check = overlayFieldCheck({ id: 'check' }, [sent, photo], '2026-10-22T13:00:00Z');
  expect(check.check_section_results[0].result).toBe('Problema leve');
  expect(check.check_item_results[0].observations).toBe('Ruido');
  expect(check.check_photos[0].signed_url).toBe('data:photo');
});
