import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkPendingChangesForTest } from '../services/technicianOfflineService';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const detail = app.slice(app.indexOf('function CheckDetailPage('), app.indexOf('function CheckBlockPageV2('));
const blockV2 = app.slice(app.indexOf('function CheckBlockPageV2('), app.indexOf('function DeficienciesPage('));

const change = (id: string, checkId: string, status: 'pending' | 'failed' | 'blocked' | 'synced' = 'pending') => ({
  id,
  type: 'check-block' as const,
  checkId,
  workOrderId: 'work-order',
  blockId: id,
  payload: {},
  status,
  createdAt: '',
  updatedAt: '',
});

describe('SAT check execution flow', () => {
  it('keeps SAT and superadmin on the executable check/block workflow', () => {
    expect(detail).toContain('canExecuteCheck(profile)');
    expect(detail).toContain('disabled={pending.length > 0}');
    expect(blockV2).toContain('if (!canExecuteCheck(profile)) return <AccessDenied />');
    expect(blockV2).toContain('{canExecuteCheck(profile) && (');
    expect(blockV2).toContain('technicianOfflineService.upsert');
  });

  it('excludes another check and reconciled local ids from finalization blockers', () => {
    const pending = [change('current-pending', 'current'), change('other-check', 'other'), change('already-synced', 'current', 'failed')];
    expect(checkPendingChangesForTest(pending, 'current', ['already-synced']).map((item) => item.id)).toEqual(['current-pending']);
  });

  it('retains real pending, failed and blocked changes for the same check', () => {
    const pending = [change('pending', 'current'), change('failed', 'current', 'failed'), change('blocked', 'current', 'blocked')];
    expect(checkPendingChangesForTest(pending, 'current').map((item) => item.status)).toEqual(['pending', 'failed', 'blocked']);
  });

  it('exposes a diagnostic instead of hiding real blockers', () => {
    expect(detail).toContain('pendingDescription');
    expect(detail).toContain('Sincroniza estos cambios antes de finalizar.');
    expect(detail).toContain('remoteLocalChangeIds(data)');
  });
});
