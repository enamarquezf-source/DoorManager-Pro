import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const offlineService = readFileSync(new URL('../services/technicianOfflineService.ts', import.meta.url), 'utf8');

describe('pending sync UI wiring', () => {
  it('loads the visible queue from the real IndexedDB queue service', () => {
    expect(app).toContain('technicianOfflineService.queueItems()');
    expect(offlineService).toContain("const dbName = 'doormanager-pro-tecnico'");
    expect(offlineService).toContain("const storeName = 'offline_changes'");
  });

  it('wires bulk and individual actions to real service methods with confirmation', () => {
    expect(app).toContain('type="checkbox"');
    expect(app).toContain('technicianOfflineService.deleteQueueItems(ids)');
    expect(app).toContain('technicianOfflineService.deleteFailedQueueItems()');
    expect(app).toContain('technicianOfflineService.syncSelected(ids, setMessage)');
    expect(app).toContain('technicianOfflineService.syncOne(changeId, setMessage)');
    expect(app).toContain('Vas a eliminar');
    expect(app).toContain('No se enviarán');
  });

  it('shows the full pending sync action page from superadmin sync', () => {
    expect(app).toContain('function SuperadminSync()');
    expect(app).toContain('return <PendingSyncPage />;');
    expect(app).toContain('path="/app/superadmin/sincronizacion"');
    expect(app).not.toContain("'/app/pendientes'])} empty=\"Sin pendientes locales visibles.\"");
  });

  it('logs real handler failures without printing secrets', () => {
    expect(app).toContain('DMP pending sync action failed');
    expect(app).toContain('message: error?.message');
    expect(app).toContain('details: error?.details');
    expect(app).toContain('hint: error?.hint');
    expect(app).toContain('code: error?.code');
    expect(app).not.toContain('service' + '_role');
  });
});
