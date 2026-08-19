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
  quotePurgeBlocks,
  quotePurgeCanShowButton,
  quotePurgeExpectedConfirmation,
  quotePurgePlanMatchesScope,
  quotePurgeResultOk,
  quotePurgeScope,
  quotePurgeScopeKey,
} from './quotePurgeFlow';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const purgeFlowSource = readFileSync(new URL('./quotePurgeFlow.ts', import.meta.url), 'utf8');
const serviceSource = readFileSync(new URL('./entityLifecycleService.ts', import.meta.url), 'utf8');
const purgeModalRegion = appSource.slice(appSource.indexOf('function QuotePurgeModal'), appSource.indexOf('function QuoteStatusSelector'));

const archivedQuote = { id: 'q-1', code: 'PRE-0002', title: 'Presupuesto archivado', deleted_at: '2026-02-01T10:00:00.000Z' };
const archivedQuoteWithPart = { ...archivedQuote, generated_work_orders: [{ id: 'wo-1', code: 'PAR-2026-000009' }] };
const activeQuote = { id: 'q-1', code: 'PRE-0001', title: 'Presupuesto activo', deleted_at: null };

describe('quotePurgeFlow: visibilidad del botón de purga', () => {
  it('muestra el botón para un presupuesto archivado visto por superadmin aunque tenga dependencias bloqueantes', () => {
    expect(quotePurgeCanShowButton(archivedQuote, 'superadmin')).toBe(true);
  });

  it('muestra el botón para un presupuesto archivado por superadmin aunque tenga partes relacionados (la decisión se toma en el dry-run)', () => {
    expect(quotePurgeCanShowButton(archivedQuoteWithPart, 'superadmin')).toBe(true);
  });

  it('oculta el botón si el presupuesto no está archivado aunque sea superadmin', () => {
    expect(quotePurgeCanShowButton(activeQuote, 'superadmin')).toBe(false);
  });

  it('oculta el botón para roles sin acceso a la purga (SAT, Gerencia, Oficina, Comercial, Técnico)', () => {
    for (const workspace of ['sat', 'gerencia', 'oficina', 'comercial', 'tecnico']) {
      expect(quotePurgeCanShowButton(archivedQuote, workspace)).toBe(false);
    }
  });
});

describe('quotePurgeFlow: scope del dry-run y nunca automático', () => {
  it('construye el scope sin activar partes en cascada salvo decisión explícita del usuario', () => {
    expect(quotePurgeScope(false)).toEqual({});
    expect(quotePurgeScope(true)).toEqual({ purge_related_work_orders: true });
  });

  it('el cambio de purge_related_work_orders cambia la clave de scope y hace que el plan anterior deje de ser válido', () => {
    expect(quotePurgeScopeKey(false)).toBe('baseline');
    expect(quotePurgeScopeKey(true)).toBe('include_work_orders');
    expect(quotePurgePlanMatchesScope('baseline', false)).toBe(true);
    expect(quotePurgePlanMatchesScope('baseline', true)).toBe(false);
    expect(quotePurgePlanMatchesScope('include_work_orders', true)).toBe(true);
    expect(quotePurgePlanMatchesScope('include_work_orders', false)).toBe(false);
    expect(quotePurgePlanMatchesScope(null, false)).toBe(false);
  });

  it('mapea los bloqueantes del plan de quotes (partes_generados y deficiencias)', () => {
    expect(quotePurgeBlocks(null)).toEqual({ generatedWorkOrders: 0, deficiencies: 0, hardBlock: false, requiresWorkOrderDecision: false });
    const blocks = quotePurgeBlocks({ blocking_dependencies: { partes_generados: 2, deficiencias: 0 } });
    expect(blocks.generatedWorkOrders).toBe(2);
    expect(blocks.requiresWorkOrderDecision).toBe(true);
    expect(blocks.hardBlock).toBe(false);
  });

  it('marca bloqueo duro cuando hay deficiencias originadas', () => {
    const blocks = quotePurgeBlocks({ blocking_dependencies: { partes_generados: 0, deficiencias: 3 } });
    expect(blocks.hardBlock).toBe(true);
    expect(blocks.requiresWorkOrderDecision).toBe(false);
  });

  it('trata purged y already_deleted como resultados válidos; dry_run no lo es', () => {
    expect(quotePurgeResultOk({ operation: 'purged' })).toBe(true);
    expect(quotePurgeResultOk({ operation: 'already_deleted' })).toBe(true);
    expect(quotePurgeResultOk({ operation: 'dry_run' })).toBe(false);
    expect(quotePurgeResultOk({ operation: 'error' })).toBe(false);
    expect(quotePurgeResultOk(null)).toBe(false);
  });
});

describe('entityLifecycleService.purge: contrato RPC 055', () => {
  beforeEach(() => {
    mockSupabase.rpcCalls.length = 0;
    mockSupabase.setRpcError(null);
  });

  it('llama a dmp_purge_entity_with_cleanup con return_stock por defecto, dry_run configurable y motivo estándar interno', async () => {
    await entityLifecycleService.purge('quotes', 'q-1', { confirmation: 'ELIMINAR PRE-0002', scope: {}, dryRun: true });

    const call = mockSupabase.rpcCalls[0];
    expect(call.fn).toBe('dmp_purge_entity_with_cleanup');
    expect(call.args.p_entity).toBe('quotes');
    expect(call.args.p_entity_id).toBe('q-1');
    expect(call.args.p_reason).toBe(STANDARD_PURGE_REASON);
    expect(call.args.p_confirmation).toBe('ELIMINAR PRE-0002');
    expect(call.args.p_scope).toEqual({});
    expect(call.args.p_return_stock).toBe(true);
    expect(call.args.p_dry_run).toBe(true);
  });

  it('propaga la decisión de purgar partes en el scope para la ejecución real', async () => {
    await entityLifecycleService.purge('quotes', 'q-1', { confirmation: 'ELIMINAR PRE-0002', scope: { purge_related_work_orders: true }, dryRun: false });

    expect(mockSupabase.rpcCalls[0].args.p_scope).toEqual({ purge_related_work_orders: true });
    expect(mockSupabase.rpcCalls[0].args.p_dry_run).toBe(false);
  });

  it('los errores del RPC conservan message/details/hint/code para diagnóstico (SupabaseOperationError)', async () => {
    mockSupabase.setRpcError({
      message: 'purga: el presupuesto tiene partes generados (1). Usa scope.purge_related_work_orders.enable para purgarlos en cascada.',
      details: 'DETALLE_SQL',
      hint: 'PISTA_SQL',
      code: 'P0001',
    });

    try {
      await entityLifecycleService.purge('quotes', 'q-1', { confirmation: 'ELIMINAR PRE-0002', scope: {}, dryRun: false });
      throw new Error('la purga debería haber lanzado');
    } catch (err: any) {
      expect(err).toBeInstanceOf(SupabaseOperationError);
      expect(err.message).toContain('purga: el presupuesto tiene partes generados');
      expect(err.details).toBe('DETALLE_SQL');
      expect(err.hint).toBe('PISTA_SQL');
      expect(err.code).toBe('P0001');
    }
  });
});

describe('quotePurgeFlow: UX simplificada y autorización (escaneo de fuentes)', () => {
  it('el modal de purga no pide motivo editable ni confirmación textual ELIMINAR <código>', () => {
    expect(purgeModalRegion).not.toContain('Confirmación definitiva');
    expect(purgeModalRegion).not.toContain('<textarea');
    expect(purgeModalRegion).not.toContain('Motivo');
  });

  it('la purga no usa .delete() directo sobre quotes; pasa exclusivamente por dmp_purge_entity_with_cleanup', () => {
    expect(purgeFlowSource).not.toMatch(/\.from\(['"]quotes['"]\)\s*\.delete/);
    expect(purgeFlowSource).not.toMatch(/quotesService\.delete\s*\(/);
    expect(serviceSource).toContain('dmp_purge_entity_with_cleanup');
    expect(serviceSource).not.toMatch(/\.from\(['"]quotes['"]\)\s*\.delete/);
  });

  it('la confirmación se genera internamente desde el código del presupuesto, sin escribirla manualmente', () => {
    expect(quotePurgeExpectedConfirmation('PRE-0002')).toBe('ELIMINAR PRE-0002');
    expect(purgeFlowSource).toContain('ELIMINAR ${code}');
  });
});