import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const mockSupabase = vi.hoisted(() => {
  const rpcCalls: { fn: string; args: Record<string, any> }[] = [];
  let rpcError: any = null;
  return {
    rpcCalls,
    setRpcError: (value: any) => { rpcError = value; },
    supabase: {
      rpc: (fn: string, args: Record<string, any>) => {
        rpcCalls.push({ fn, args });
        return Promise.resolve(rpcError ? { data: null, error: rpcError } : { data: { operation: 'dry_run', plan: {} }, error: null });
      },
    },
  };
});

vi.mock('../lib/supabase/client', () => ({ supabase: mockSupabase.supabase }));

import { STANDARD_PURGE_REASON, entityLifecycleService } from './entityLifecycleService';
import { SupabaseOperationError } from './query';
import {
  workOrderPurgeBlocks,
  workOrderPurgeCanShowButton,
  workOrderPurgeExpectedConfirmation,
  workOrderPurgePlanItems,
  workOrderPurgePlanMatchesScope,
  workOrderPurgeResultOk,
  workOrderPurgeScope,
  workOrderPurgeScopeKey,
} from './workOrderPurgeFlow';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const purgeFlowSource = readFileSync(new URL('./workOrderPurgeFlow.ts', import.meta.url), 'utf8');
const serviceSource = readFileSync(new URL('./entityLifecycleService.ts', import.meta.url), 'utf8');
const modalRegion = appSource.slice(appSource.indexOf('function WorkOrderPurgeModal'), appSource.indexOf('function QuoteStatusSelector'));

const archivedWorkOrder = { id: 'wo-1', code: 'PAR-2026-000009', title: 'Parte archivado', deleted_at: '2026-02-01T10:00:00.000Z' };
const archivedWithQuote = { ...archivedWorkOrder, quote_id: 'q-1', main_equipment_id: 'eq-1' };
const activeWorkOrder = { id: 'wo-1', code: 'PAR-2026-000009', title: 'Parte activo', deleted_at: null };

describe('workOrderPurgeFlow: visibilidad del botón de purga', () => {
  it('muestra el botón para un parte archivado visto por superadmin aunque tenga dependencias bloqueantes', () => {
    expect(workOrderPurgeCanShowButton(archivedWorkOrder, 'superadmin')).toBe(true);
  });

  it('muestra el botón para un parte archivado por superadmin aunque tenga presupuesto y equipo vinculados (las dependencias se deciden en el dry-run)', () => {
    expect(workOrderPurgeCanShowButton(archivedWithQuote, 'superadmin')).toBe(true);
  });

  it('oculta el botón si el parte no está archivado aunque sea superadmin', () => {
    expect(workOrderPurgeCanShowButton(activeWorkOrder, 'superadmin')).toBe(false);
  });

  it('oculta el botón para roles sin acceso a la purga (SAT, Gerencia, Oficina, Comercial, Técnico)', () => {
    for (const workspace of ['sat', 'gerencia', 'oficina', 'comercial', 'tecnico']) {
      expect(workOrderPurgeCanShowButton(archivedWorkOrder, workspace)).toBe(false);
    }
  });

  it('oculta el botón si no hay parte o no hay workspace superadmin', () => {
    expect(workOrderPurgeCanShowButton(null, 'superadmin')).toBe(false);
    expect(workOrderPurgeCanShowButton(undefined, 'superadmin')).toBe(false);
  });
});

describe('workOrderPurgeFlow: scope del dry-run y nunca automático', () => {
  it('construye el scope sin activar decisiones salvo decisión explícita del usuario', () => {
    expect(workOrderPurgeScope(false, false)).toEqual({});
    expect(workOrderPurgeScope(true, false)).toEqual({ documents: 'purge' });
    expect(workOrderPurgeScope(false, true)).toEqual({ stock_movements: 'purge' });
    expect(workOrderPurgeScope(true, true)).toEqual({ documents: 'purge', stock_movements: 'purge' });
  });

  it('el cambio de decisiones cambia la clave de scope y hace que el plan anterior deje de ser válido', () => {
    expect(workOrderPurgeScopeKey(false, false)).toBe('baseline');
    expect(workOrderPurgeScopeKey(true, false)).toBe('include_documents');
    expect(workOrderPurgeScopeKey(false, true)).toBe('include_stock_movements');
    expect(workOrderPurgeScopeKey(true, true)).toBe('include_documents_and_stock_movements');
    expect(workOrderPurgePlanMatchesScope('baseline', false, false)).toBe(true);
    expect(workOrderPurgePlanMatchesScope('baseline', true, false)).toBe(false);
    expect(workOrderPurgePlanMatchesScope('include_documents', true, false)).toBe(true);
    expect(workOrderPurgePlanMatchesScope('include_documents', true, true)).toBe(false);
    expect(workOrderPurgePlanMatchesScope('include_stock_movements', false, true)).toBe(true);
    expect(workOrderPurgePlanMatchesScope('include_documents_and_stock_movements', true, true)).toBe(true);
    expect(workOrderPurgePlanMatchesScope(null, false, false)).toBe(false);
  });

  it('mapea los bloqueantes del plan de partes (documentos_enlazados y movimientos_stock)', () => {
    expect(workOrderPurgeBlocks(null)).toEqual({ documents: 0, stockMovements: 0, externalDeficiencies: 0, unclassifiedDeficiencyReferences: 0, hardBlock: false });
    const blocks = workOrderPurgeBlocks({ blocking_dependencies: { documentos_enlazados: 3, movimientos_stock: 2, deficiencias_externas: 0, referencias_deficiencias_no_clasificadas: 0 } });
    expect(blocks.documents).toBe(3);
    expect(blocks.stockMovements).toBe(2);
    expect(blocks.hardBlock).toBe(false);
  });

  it('marca bloqueo duro cuando hay deficiencias externas o referencias a deficiencias no clasificadas', () => {
    const external = workOrderPurgeBlocks({ blocking_dependencies: { documentos_enlazados: 0, movimientos_stock: 0, deficiencias_externas: 2, referencias_deficiencias_no_clasificadas: 0 } });
    expect(external.hardBlock).toBe(true);
    const references = workOrderPurgeBlocks({ blocking_dependencies: { documentos_enlazados: 0, movimientos_stock: 0, deficiencias_externas: 0, referencias_deficiencias_no_clasificadas: 1 } });
    expect(references.hardBlock).toBe(true);
  });

  it('documentos y movimientos de stock por sí solos no bloquean la purga si se decide explícitamente', () => {
    const blocks = workOrderPurgeBlocks({ blocking_dependencies: { documentos_enlazados: 5, movimientos_stock: 4, deficiencias_externas: 0, referencias_deficiencias_no_clasificadas: 0 } });
    expect(blocks.hardBlock).toBe(false);
  });

  it('trata purged y already_deleted como resultados válidos; dry_run no lo es', () => {
    expect(workOrderPurgeResultOk({ operation: 'purged' })).toBe(true);
    expect(workOrderPurgeResultOk({ operation: 'already_deleted' })).toBe(true);
    expect(workOrderPurgeResultOk({ operation: 'dry_run' })).toBe(false);
    expect(workOrderPurgeResultOk({ operation: 'error' })).toBe(false);
    expect(workOrderPurgeResultOk(null)).toBe(false);
  });
});

describe('workOrderPurgeFlow: resumen del plan y confirmación', () => {
  it('la confirmación se genera internamente desde el código del parte, sin escribirla manualmente', () => {
    expect(workOrderPurgeExpectedConfirmation('PAR-2026-000009')).toBe('ELIMINAR PAR-2026-000009');
    expect(purgeFlowSource).toContain('ELIMINAR ${code}');
  });

  it('el resumen del plan solo usa claves reales del backend, sin inventar ninguna', () => {
    const plan = { cascade_dependencies: {
      equipos_adicionales: 1, asignaciones: 2, historial_estados: 3, notas: 0, horas: 4, materiales: 5,
      recursos_costes: 2, decisiones_materiales_previstos: 1, decisiones_conceptos_previstos: 1,
      fotos: 3, firmas: 1, checks: 2, deficiencias_propias: 0, acciones_correctivas: 0, avisos: 1,
      solicitudes_material: 1, presupuestos_vinculados: 1, movimientos_stock_nuevos: 0,
      clave_inventada: 99,
    } };
    const items = workOrderPurgePlanItems(plan);
    expect(items.some(([label]) => label === 'Clave inventada')).toBe(false);
    expect(items.some(([label]) => label === 'Checks')).toBe(true);
    expect(items.find(([label]) => label === 'Materiales')?.[1]).toBe('5');
    expect(items.find(([label]) => label === 'Movimientos de stock')?.[1]).toBe('0');
    expect(items.find(([label]) => label === 'Presupuestos vinculados')?.[1]).toBe('1');
  });
});

describe('entityLifecycleService.purge: contrato RPC 055/057 para work_orders', () => {
  beforeEach(() => {
    mockSupabase.rpcCalls.length = 0;
    mockSupabase.setRpcError(null);
  });

  it('llama a dmp_purge_entity_with_cleanup con return_stock=true, motivo estándar interno y dry_run configurable', async () => {
    await entityLifecycleService.purge('work_orders', 'wo-1', { confirmation: 'ELIMINAR PAR-2026-000009', scope: {}, dryRun: true });

    const call = mockSupabase.rpcCalls[0];
    expect(call.fn).toBe('dmp_purge_entity_with_cleanup');
    expect(call.args.p_entity).toBe('work_orders');
    expect(call.args.p_entity_id).toBe('wo-1');
    expect(call.args.p_reason).toBe(STANDARD_PURGE_REASON);
    expect(call.args.p_confirmation).toBe('ELIMINAR PAR-2026-000009');
    expect(call.args.p_scope).toEqual({});
    expect(call.args.p_return_stock).toBe(true);
    expect(call.args.p_dry_run).toBe(true);
  });

  it('propaga las decisiones de documentos y stock en el scope para la ejecución real', async () => {
    await entityLifecycleService.purge('work_orders', 'wo-1', { confirmation: 'ELIMINAR PAR-2026-000009', scope: { documents: 'purge', stock_movements: 'purge' }, dryRun: false });

    expect(mockSupabase.rpcCalls[0].args.p_scope).toEqual({ documents: 'purge', stock_movements: 'purge' });
    expect(mockSupabase.rpcCalls[0].args.p_dry_run).toBe(false);
  });

  it('los errores del RPC conservan message/details/hint/code para diagnóstico (SupabaseOperationError)', async () => {
    mockSupabase.setRpcError({
      message: 'purga: el parte tiene deficiencias externas (2). Resuélvelas antes de purgar.',
      details: 'DETALLE_SQL',
      hint: 'PISTA_SQL',
      code: 'P0001',
    });

    try {
      await entityLifecycleService.purge('work_orders', 'wo-1', { confirmation: 'ELIMINAR PAR-2026-000009', scope: {}, dryRun: false });
      throw new Error('la purga debería haber lanzado');
    } catch (err: any) {
      expect(err).toBeInstanceOf(SupabaseOperationError);
      expect(err.message).toContain('el parte tiene deficiencias externas');
      expect(err.details).toBe('DETALLE_SQL');
      expect(err.hint).toBe('PISTA_SQL');
      expect(err.code).toBe('P0001');
    }
  });
});

describe('workOrderPurgeFlow: UX simplificada y autorización (escaneo de fuentes)', () => {
  it('el modal de purga no pide motivo editable ni confirmación textual ELIMINAR <código> manual', () => {
    expect(modalRegion).not.toContain('Confirmación definitiva');
    expect(modalRegion).not.toContain('<textarea');
    expect(modalRegion).not.toContain('Motivo');
  });

  it('la purga no usa .delete() directo sobre work_orders; pasa exclusivamente por dmp_purge_entity_with_cleanup', () => {
    expect(purgeFlowSource).not.toMatch(/\.from\(['"]work_orders['"]\)\s*\.delete/);
    expect(purgeFlowSource).not.toMatch(/workOrdersService\.delete\s*\(/);
    expect(serviceSource).toContain('dmp_purge_entity_with_cleanup');
    expect(serviceSource).not.toMatch(/\.from\(['"]work_orders['"]\)\s*\.delete/);
  });

  it('el botón de purga se integra en el detalle y en la tarjeta del listado usando el helper de visibilidad', () => {
    const detail = appSource.slice(appSource.indexOf('function WorkOrderDetailPageV2'), appSource.indexOf('function money'));
    expect(detail).toContain('workOrderPurgeCanShowButton(data, workspace)');
    expect(detail).toContain('Eliminar definitivamente');
    expect(detail).toContain('navigate(\'/app/partes\')');
    const list = appSource.slice(appSource.indexOf('function WorkOrdersPage'), appSource.indexOf('function WorkOrderDetailPageV2'));
    expect(list).toContain('workOrderPurgeCanShowButton(work, workspace)');
  });
});