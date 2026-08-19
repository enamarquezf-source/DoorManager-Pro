import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

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
  checksPurgeConfig,
  casesPurgeConfig,
  entityPurgeBlockers,
  entityPurgeCanShowButton,
  entityPurgeExpectedConfirmation,
  entityPurgePlanMatchesScope,
  entityPurgeResultOk,
  entityPurgeScope,
  entityPurgeScopeKey,
  equipmentPurgeConfig,
} from './entityPurgeFlow';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const purgeFlowSource = readFileSync(new URL('./entityPurgeFlow.ts', import.meta.url), 'utf8');
const serviceSource = readFileSync(new URL('./entityLifecycleService.ts', import.meta.url), 'utf8');
const modalRegion = appSource.slice(appSource.indexOf('function GenericEntityPurgeModal'), appSource.indexOf('function QuoteStatusSelector'));

const archived = { id: 'r-1', code: 'EQ-000001', title: 'Registro archivado', deleted_at: '2026-02-01T10:00:00.000Z' };
const active = { id: 'r-1', code: 'EQ-000001', title: 'Registro activo', deleted_at: null };

describe('entityPurgeFlow: visibilidad del botón por entidad (equipment, cases, checks)', () => {
  it('muestra el botón para un registro archivado visto por superadmin', () => {
    expect(entityPurgeCanShowButton('equipment', archived, 'superadmin')).toBe(true);
    expect(entityPurgeCanShowButton('cases', archived, 'superadmin')).toBe(true);
    expect(entityPurgeCanShowButton('checks', archived, 'superadmin')).toBe(true);
  });

  it('muestra el botón aunque el registro tenga dependencias (se deciden en el dry-run)', () => {
    expect(entityPurgeCanShowButton('equipment', { ...archived, client_id: 'c-1' }, 'superadmin')).toBe(true);
    expect(entityPurgeCanShowButton('cases', { ...archived, client_id: 'c-1' }, 'superadmin')).toBe(true);
  });

  it('oculta el botón si el registro no está archivado aunque sea superadmin', () => {
    expect(entityPurgeCanShowButton('equipment', active, 'superadmin')).toBe(false);
    expect(entityPurgeCanShowButton('cases', active, 'superadmin')).toBe(false);
    expect(entityPurgeCanShowButton('checks', active, 'superadmin')).toBe(false);
  });

  it('oculta el botón para roles sin acceso a la purga', () => {
    for (const workspace of ['sat', 'gerencia', 'oficina', 'comercial', 'tecnico']) {
      expect(entityPurgeCanShowButton('equipment', archived, workspace)).toBe(false);
      expect(entityPurgeCanShowButton('cases', archived, workspace)).toBe(false);
      expect(entityPurgeCanShowButton('checks', archived, workspace)).toBe(false);
    }
  });

  it('oculta el botón si no hay registro', () => {
    expect(entityPurgeCanShowButton('equipment', null, 'superadmin')).toBe(false);
    expect(entityPurgeCanShowButton('equipment', undefined, 'superadmin')).toBe(false);
  });
});

describe('entityPurgeFlow: scope del dry-run y decisiones por entidad', () => {
  it('construye el scope sin activar decisiones salvo decisión explícita del usuario', () => {
    expect(entityPurgeScope(equipmentPurgeConfig, [])).toEqual({});
    expect(entityPurgeScope(equipmentPurgeConfig, ['purge_related_work_orders'])).toEqual({ purge_related_work_orders: true });
    expect(entityPurgeScope(equipmentPurgeConfig, ['documents'])).toEqual({ documents: 'purge' });
    expect(entityPurgeScope(equipmentPurgeConfig, ['purge_related_work_orders', 'documents'])).toEqual({ purge_related_work_orders: true, documents: 'purge' });
    expect(entityPurgeScope(casesPurgeConfig, ['purge_related_work_orders'])).toEqual({ purge_related_work_orders: true });
    expect(entityPurgeScope(checksPurgeConfig, [])).toEqual({});
  });

  it('las claves de scope se ordenan y permiten invalidar un plan anterior al cambiar decisiones', () => {
    expect(entityPurgeScopeKey([])).toBe('baseline');
    expect(entityPurgeScopeKey(['documents'])).toBe('documents');
    expect(entityPurgeScopeKey(['purge_related_work_orders'])).toBe('purge_related_work_orders');
    expect(entityPurgeScopeKey(['documents', 'purge_related_work_orders'])).toBe('documents+purge_related_work_orders');
    expect(entityPurgePlanMatchesScope('baseline', [])).toBe(true);
    expect(entityPurgePlanMatchesScope('baseline', ['documents'])).toBe(false);
    expect(entityPurgePlanMatchesScope('documents', ['documents'])).toBe(true);
    expect(entityPurgePlanMatchesScope(null, [])).toBe(false);
  });

  it('equipment: partes_activos y documentos son decisiones; partes_archivados y deficiencias son bloqueos duros; presupuestos es informativo', () => {
    const blocks = entityPurgeBlockers(equipmentPurgeConfig, { blocking_dependencies: {
      partes_activos: 2, partes_archivados: 1, documentos: 3, deficiencias: 1, presupuestos: 2,
    } });
    expect(blocks.decisions.map((item) => item.config.blockerKey)).toEqual(['partes_activos', 'documentos']);
    expect(blocks.hard.map((item) => item.key)).toEqual(['partes_archivados', 'deficiencias']);
    expect(blocks.informational.map((item) => item.key)).toEqual(['presupuestos']);
    expect(blocks.decisions.find((item) => item.config.blockerKey === 'partes_activos')?.count).toBe(2);
  });

  it('equipment: sin dependencias bloqueantes no hay decisiones, bloqueos ni notas', () => {
    const blocks = entityPurgeBlockers(equipmentPurgeConfig, { blocking_dependencies: {} });
    expect(blocks.decisions).toEqual([]);
    expect(blocks.hard).toEqual([]);
    expect(blocks.informational).toEqual([]);
  });

  it('cases: partes es decisión; presupuestos y oportunidades bloquean duro (sin cascada automática silenciosa)', () => {
    const blocks = entityPurgeBlockers(casesPurgeConfig, { blocking_dependencies: { partes: 1, presupuestos: 2, oportunidades: 1 } });
    expect(blocks.decisions.map((item) => item.config.blockerKey)).toEqual(['partes']);
    expect(blocks.hard.map((item) => item.key)).toEqual(['presupuestos', 'oportunidades']);
    expect(blocks.informational).toEqual([]);
  });

  it('checks: deficiencias bloquea duro y no hay decisiones', () => {
    const blocks = entityPurgeBlockers(checksPurgeConfig, { blocking_dependencies: { deficiencias: 1 } });
    expect(blocks.hard.map((item) => item.key)).toEqual(['deficiencias']);
    expect(blocks.decisions).toEqual([]);
    const clean = entityPurgeBlockers(checksPurgeConfig, { blocking_dependencies: {} });
    expect(clean.hard).toEqual([]);
  });

  it('equipment: nunca expone deficiencias como decisión (require force en el motor)', () => {
    expect(equipmentPurgeConfig.decisions.map((d) => d.blockerKey)).not.toContain('deficiencias');
    expect(equipmentPurgeConfig.decisions.map((d) => d.scopeKey)).not.toContain('stock_movements');
  });
});

describe('entityPurgeFlow: confirmación y resultados', () => {
  it('la confirmación se genera internamente desde el código, sin escribirla manualmente', () => {
    expect(entityPurgeExpectedConfirmation('EQ-000001')).toBe('ELIMINAR EQ-000001');
    expect(entityPurgeExpectedConfirmation('EXP-2026-000001')).toBe('ELIMINAR EXP-2026-000001');
    expect(purgeFlowSource).toContain('ELIMINAR ${code}');
  });

  it('trata purged y already_deleted como resultados válidos; dry_run no lo es', () => {
    expect(entityPurgeResultOk({ operation: 'purged' })).toBe(true);
    expect(entityPurgeResultOk({ operation: 'already_deleted' })).toBe(true);
    expect(entityPurgeResultOk({ operation: 'dry_run' })).toBe(false);
    expect(entityPurgeResultOk({ operation: 'error' })).toBe(false);
    expect(entityPurgeResultOk(null)).toBe(false);
  });
});

describe('entityLifecycleService.purge: contrato RPC 055/057 para equipment', () => {
  beforeEach(() => {
    mockSupabase.rpcCalls.length = 0;
    mockSupabase.setRpcError(null);
  });

  it('llama a dmp_purge_entity_with_cleanup con return_stock=true, motivo estándar interno y scope por defecto vacío en dry-run', async () => {
    await entityLifecycleService.purge('equipment', 'eq-1', { confirmation: 'ELIMINAR EQ-000001', scope: {}, dryRun: true });

    const call = mockSupabase.rpcCalls[0];
    expect(call.fn).toBe('dmp_purge_entity_with_cleanup');
    expect(call.args.p_entity).toBe('equipment');
    expect(call.args.p_entity_id).toBe('eq-1');
    expect(call.args.p_reason).toBe(STANDARD_PURGE_REASON);
    expect(call.args.p_confirmation).toBe('ELIMINAR EQ-000001');
    expect(call.args.p_scope).toEqual({});
    expect(call.args.p_return_stock).toBe(true);
    expect(call.args.p_dry_run).toBe(true);
  });

  it('propaga las decisiones en el scope para la ejecución real', async () => {
    await entityLifecycleService.purge('equipment', 'eq-1', { confirmation: 'ELIMINAR EQ-000001', scope: { purge_related_work_orders: true, documents: 'purge' }, dryRun: false });

    expect(mockSupabase.rpcCalls[0].args.p_scope).toEqual({ purge_related_work_orders: true, documents: 'purge' });
    expect(mockSupabase.rpcCalls[0].args.p_dry_run).toBe(false);
  });

  it('los errores del RPC conservan message/details/hint/code para diagnóstico', async () => {
    mockSupabase.setRpcError({ message: 'purga: el equipo tiene partes archivados (1).', details: 'DETALLE_SQL', hint: 'PISTA_SQL', code: 'P0001' });

    try {
      await entityLifecycleService.purge('equipment', 'eq-1', { confirmation: 'ELIMINAR EQ-000001', scope: {}, dryRun: false });
      throw new Error('la purga debería haber lanzado');
    } catch (err: any) {
      expect(err).toBeInstanceOf(SupabaseOperationError);
      expect(err.message).toContain('el equipo tiene partes archivados');
      expect(err.details).toBe('DETALLE_SQL');
      expect(err.hint).toBe('PISTA_SQL');
      expect(err.code).toBe('P0001');
    }
  });
});

describe('entityPurgeFlow: UX simplificada y autorización (escaneo de fuentes)', () => {
  it('el modal genérico no pide motivo editable ni confirmación textual ELIMINAR <código> manual', () => {
    expect(modalRegion).not.toContain('Confirmación definitiva');
    expect(modalRegion).not.toContain('<textarea');
    expect(modalRegion).not.toContain('Motivo');
    expect(modalRegion).toContain('entityPurgeExpectedConfirmation');
  });

  it('la purga genérica no usa .delete() directo; pasa exclusivamente por dmp_purge_entity_with_cleanup', () => {
    expect(purgeFlowSource).not.toMatch(/\.delete\s*\(/);
    expect(purgeFlowSource).not.toMatch(/\.from\(/);
    expect(serviceSource).toContain('dmp_purge_entity_with_cleanup');
    expect(serviceSource).not.toMatch(/\.from\(['"](equipment|cases|checks)['"]\)\s*\.delete/);
  });

  it('el botón de purga se integra en el listado y detalles con el helper de visibilidad, solo para superadmin', () => {
    expect(appSource).toContain("entityPurgeCanShowButton('equipment', item, workspace)");
    expect(appSource).toContain("entityPurgeCanShowButton('equipment', data, workspace)");
    expect(appSource).toContain("entityPurgeCanShowButton('equipment', data, 'superadmin')");
    expect(appSource).toContain("entityPurgeCanShowButton('cases', data, workspace)");
    expect(appSource).toContain("entityPurgeCanShowButton('checks', data, workspace)");
    expect(appSource).toContain('function GenericEntityPurgeModal');
  });

  it('no se ha refactorizado ni eliminado los modales existentes de quotes y work_orders', () => {
    expect(appSource).toContain('function QuotePurgeModal');
    expect(appSource).toContain('function WorkOrderPurgeModal');
  });

  it('no se ha implementado UI de purga para entidades del grupo B/C (clients, sites, check_templates, materials, profiles)', () => {
    for (const entity of ['clients', 'sites', 'check_templates', 'materials', 'profiles']) {
      expect(appSource).not.toContain(`entityPurgeCanShowButton('${entity}'`);
    }
    expect(purgeFlowSource).not.toContain("'materials'");
    expect(purgeFlowSource).not.toContain("'clients'");
    expect(purgeFlowSource).not.toContain("'profiles'");
  });

  it('no se ha creado una migración 058 sin autorización', () => {
    const migrations = readdirSync(new URL('../../supabase/migrations/', import.meta.url));
    expect(migrations.some((name) => name.startsWith('058_'))).toBe(false);
  });
});