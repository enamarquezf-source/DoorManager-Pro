import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSupabase = vi.hoisted(() => {
  const rpcCalls: { fn: string; args: Record<string, any> }[] = [];
  return {
    rpcCalls,
    supabase: {
      rpc: (fn: string, args: Record<string, any>) => {
        rpcCalls.push({ fn, args });
        return Promise.resolve({ data: null, error: null });
      },
    },
  };
});

vi.mock('../lib/supabase/client', () => ({ supabase: mockSupabase.supabase }));

import { entityLifecycleService } from './entityLifecycleService';
import {
  quotePurgeBlocks,
  quotePurgeCanShowButton,
  quotePurgeExpectedConfirmation,
  quotePurgeResultOk,
  quotePurgeScope,
} from './quotePurgeFlow';

const archivedQuote = { id: 'q-1', code: 'PRE-0002', title: 'Presupuesto archivado', deleted_at: '2026-02-01T10:00:00.000Z' };
const activeQuote = { id: 'q-1', code: 'PRE-0001', title: 'Presupuesto activo', deleted_at: null };

describe('quotePurgeFlow: visibilidad del botón de purga', () => {
  it('muestra el botón para un presupuesto archivado visto por superadmin aunque tenga dependencias bloqueantes', () => {
    expect(quotePurgeCanShowButton(archivedQuote, 'superadmin')).toBe(true);
  });

  it('muestra el botón para un presupuesto archivado por superadmin aunque tenga partes relacionados (la decisión se toma en el dry-run)', () => {
    expect(quotePurgeCanShowButton({ ...archivedQuote, generated_work_orders: [{ id: 'wo-1', code: 'PAR-2026-000009' }] }, 'superadmin')).toBe(true);
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

describe('quotePurgeFlow: confirmación y decisión de partes', () => {
  it('construye la confirmación exacta ELIMINAR <código> para dry-run y ejecución', () => {
    expect(quotePurgeExpectedConfirmation('PRE-0002')).toBe('ELIMINAR PRE-0002');
  });

  it('mapea los bloqueantes del plan de quotes (partes_generados y deficiencias)', () => {
    expect(quotePurgeBlocks(null)).toEqual({ generatedWorkOrders: 0, deficiencies: 0, hardBlock: false, requiresWorkOrderDecision: false });
    const plan = { blocking_dependencies: { partes_generados: 2, deficiencias: 0 } };
    const blocks = quotePurgeBlocks(plan);
    expect(blocks.generatedWorkOrders).toBe(2);
    expect(blocks.deficiencies).toBe(0);
    expect(blocks.hardBlock).toBe(false);
    expect(blocks.requiresWorkOrderDecision).toBe(true);
  });

  it('marca bloqueo duro cuando hay deficiencias originadas y nunca pide decisión de partes si no hay', () => {
    const blocks = quotePurgeBlocks({ blocking_dependencies: { partes_generados: 0, deficiencias: 3 } });
    expect(blocks.hardBlock).toBe(true);
    expect(blocks.requiresWorkOrderDecision).toBe(false);
  });

  it('construye el scope sin activar partes en cascada salvo decisión explícita del usuario', () => {
    expect(quotePurgeScope(false)).toEqual({});
    expect(quotePurgeScope(true)).toEqual({ purge_related_work_orders: true });
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
  });

  it('llama a dmp_purge_entity_with_cleanup con return_stock por defecto y dry_run configurable', async () => {
    await entityLifecycleService.purge('quotes', 'q-1', {
      reason: 'Eliminación de datos de prueba',
      confirmation: 'ELIMINAR PRE-0002',
      scope: {},
      dryRun: true,
    });

    const call = mockSupabase.rpcCalls[0];
    expect(call.fn).toBe('dmp_purge_entity_with_cleanup');
    expect(call.args.p_entity).toBe('quotes');
    expect(call.args.p_entity_id).toBe('q-1');
    expect(call.args.p_reason).toBe('Eliminación de datos de prueba');
    expect(call.args.p_confirmation).toBe('ELIMINAR PRE-0002');
    expect(call.args.p_scope).toEqual({});
    expect(call.args.p_return_stock).toBe(true);
    expect(call.args.p_dry_run).toBe(true);
  });

  it('propaga la decisión de purgar partes en el scope para la ejecución real', async () => {
    await entityLifecycleService.purge('quotes', 'q-1', {
      reason: 'Datos de prueba',
      confirmation: 'ELIMINAR PRE-0002',
      scope: { purge_related_work_orders: true },
      dryRun: false,
    });

    expect(mockSupabase.rpcCalls[0].args.p_scope).toEqual({ purge_related_work_orders: true });
    expect(mockSupabase.rpcCalls[0].args.p_dry_run).toBe(false);
  });
});
