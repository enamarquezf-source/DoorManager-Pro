import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { canReviewWorkOrderOffice } from '../auth/permissions';
import { workOrdersService } from '../services/workOrdersService';
import { canCloseOfficeValidationModal, canShowOfficeValidationActions, isOfficeValidationUnavailable, submitOfficeValidationReview } from '../shared/officeValidation';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase/client', () => ({ supabase: { rpc } }));

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../App.tsx');
const labels = read('../shared/labels.ts');
const filters = read('../shared/filters.ts');
const profile = (primary_area: string) => ({ active: true, deleted_at: null, primary_area, roles: [], company_id: 'company' } as any);
const id = '11111111-1111-4111-8111-111111111111';

describe('office validation 073 runtime UI', () => {
  it.each(['superadmin', 'SAT', 'Gerencia', 'Oficina'])('%s + pending shows actions', (role) => {
    expect(canShowOfficeValidationActions('pending', canReviewWorkOrderOffice(profile(role)))).toBe(true);
  });

  it.each(['Tecnico', 'Comercial'])('%s + pending hides actions', (role) => {
    expect(canShowOfficeValidationActions('pending', canReviewWorkOrderOffice(profile(role)))).toBe(false);
  });

  it.each(['not_started', 'validated', 'rejected'])('%s never shows actions', (status) => {
    expect(canShowOfficeValidationActions(status, true)).toBe(false);
  });

  it('calls the validated RPC with the exact trimmed payload', async () => {
    rpc.mockResolvedValueOnce({ data: { id }, error: null });
    await expect(workOrdersService.reviewWorkOrderOffice(id, 'validated', '  Revisión correcta  ')).resolves.toEqual({ id });
    expect(rpc).toHaveBeenCalledWith('dmp_review_work_order_office', { p_work_order_id: id, p_decision: 'validated', p_reason: 'Revisión correcta' });
  });

  it('calls the rejected RPC with the exact payload', async () => {
    rpc.mockResolvedValueOnce({ data: { id }, error: null });
    await workOrdersService.reviewWorkOrderOffice(id, 'rejected', 'Debe corregirse');
    expect(rpc).toHaveBeenCalledWith('dmp_review_work_order_office', { p_work_order_id: id, p_decision: 'rejected', p_reason: 'Debe corregirse' });
  });

  it.each(['', '   '])('rejects empty reason synchronously without RPC (%j)', (reason) => {
    rpc.mockClear();
    expect(() => workOrdersService.reviewWorkOrderOffice(id, 'validated', reason)).toThrow('motivo o comentario');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('keeps the review modal state after an operational error and allows retry', async () => {
    const review = vi.fn().mockRejectedValueOnce(new Error('fallo temporal')).mockResolvedValueOnce({ id });
    const onError = vi.fn();
    const onSuccess = vi.fn();
    await expect(submitOfficeValidationReview({ decision: 'validated', reason: 'Comentario', saving: false, review, onSuccess, onError })).resolves.toBe(false);
    expect(onError).toHaveBeenCalledOnce();
    expect(onSuccess).not.toHaveBeenCalled();
    await expect(submitOfficeValidationReview({ decision: 'validated', reason: 'Comentario', saving: false, review, onSuccess, onError })).resolves.toBe(true);
    expect(review).toHaveBeenCalledTimes(2);
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it('prevents empty submission and duplicate submission while saving', async () => {
    const review = vi.fn().mockResolvedValue({ id });
    const onSuccess = vi.fn();
    await expect(submitOfficeValidationReview({ decision: 'validated', reason: '   ', saving: false, review, onSuccess, onError: vi.fn() })).resolves.toBe(false);
    await expect(submitOfficeValidationReview({ decision: 'validated', reason: 'Comentario', saving: true, review, onSuccess, onError: vi.fn() })).resolves.toBe(false);
    expect(review).not.toHaveBeenCalled();
  });

  it('refreshes through the success callback and blocks Escape only while saving', async () => {
    const onSuccess = vi.fn();
    await submitOfficeValidationReview({ decision: 'rejected', reason: 'Debe corregirse', saving: false, review: vi.fn().mockResolvedValue({ id }), onSuccess, onError: vi.fn() });
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(canCloseOfficeValidationModal(false)).toBe(true);
    expect(canCloseOfficeValidationModal(true)).toBe(false);
  });

  it('classifies missing capability separately from operational errors', () => {
    expect(isOfficeValidationUnavailable({ code: 'PGRST202' })).toBe(true);
    expect(isOfficeValidationUnavailable({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isOfficeValidationUnavailable({ message: 'Failed to fetch' })).toBe(false);
    expect(isOfficeValidationUnavailable({ message: 'validacion: el parte no esta pendiente' })).toBe(false);
    expect(isOfficeValidationUnavailable({ message: 'unknown backend failure' })).toBe(false);
  });

  it('keeps labels, UI wiring and backend boundary separate', () => {
    expect(labels).toContain('officeValidationStatuses');
    expect(filters).toContain("'pendientes-validacion'");
    expect(app).toContain('workOrdersService.reviewWorkOrderOffice');
    expect(app).toContain('useOverlayScrollLock();');
    expect(app).toContain("canCloseOfficeValidationModal(saving)");
    expect(app).not.toContain('office_validation_status:');
  });
});
