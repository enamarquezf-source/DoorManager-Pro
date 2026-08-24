import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { workOrderCheckAction, workOrderDetailWarnings, workOrderOperationalMetrics, workOrderWarningTone } from '../shared/workOrderDetailUx';
import { canViewWorkOrderCosts } from '../auth/permissions';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const workOrdersService = readFileSync(new URL('./workOrdersService.ts', import.meta.url), 'utf8');
const mobileDetail = app.slice(app.indexOf('function TechnicianWorkOrderUx'), app.indexOf('function TechnicianWorkOrderProgress'));

describe('detalle del parte UX V1', () => {
  it('muestra cabecera compacta con prioridad, técnico y agenda cuando existen', () => {
    expect(app).toContain('work-header-meta');
    expect(app).toContain('Prioridad:');
    expect(app).toContain('Técnico:');
    expect(app).toContain('Agenda:');
    expect(app).toContain('equipmentTypeName(data.primary_equipment)');
    expect(app).toContain('data.scheduled_date');
    expect(app).toContain('data.scheduled_time');
  });

  it('calcula el resumen operativo desde los datos cargados', () => {
    expect(workOrderOperationalMetrics({
      time_entries: [{ duration_minutes: 90 }],
      materials: [{ id: 'mat' }],
      cost_entries: [{ id: 'cost' }],
      checks: [{ status: 'Realizado' }, { status: 'Por realizar' }],
      deficiencies: [{ status: 'Pendiente' }],
      photos: [{ id: 'photo' }],
      signatures: [{ id: 'signature' }],
      documents: [{ id: 'document' }],
      finished_at: null,
    })).toMatchObject({ totalMinutes: 90, materials: 1, costs: 1, checksComplete: 1, checksTotal: 2, openDeficiencies: 1, photos: 1, signatures: 1, documents: 1, closure: 'Pendiente' });
  });

  it('genera avisos informativos sin convertirlos en validaciones', () => {
    expect(workOrderDetailWarnings({ checks: [{ status: 'Por realizar' }], time_entries: [], materials: [], cost_entries: [], deficiencies: [], photos: [], signatures: [], diagnosis: '', work_performed: '', result: '' })).toEqual(expect.arrayContaining(['1 check pendiente', 'Sin horas registradas', 'Sin materiales registrados', 'Sin fotos registradas', 'No hay firma registrada', 'Información operativa incompleta']));
    expect(workOrderWarningTone('Sin materiales registrados')).toBe('neutral');
    expect(workOrderWarningTone('1 check pendiente')).toBe('attention');
    expect(workOrderWarningTone('2 deficiencias abiertas')).toBe('important');
    expect(app).not.toContain('Debes añadir materiales');
  });

  it('distingue abrir un check existente de crear uno nuevo', () => {
    expect(workOrderCheckAction({ checks: [{ id: 'check-1' }] }, false)).toBe('Abrir check');
    expect(workOrderCheckAction({ checks: [] }, true)).toBe('Crear check');
    expect(workOrderCheckAction({ checks: [] }, false)).toBeNull();
  });

  it('mantiene economía y cierre con los contratos existentes', () => {
    expect(app).toContain("economicService.workOrderSummary");
    expect(app).toContain("canViewWorkOrderCosts(profile)");
    expect(app).toContain("workOrdersService.finalizeTechnical");
    expect(workOrdersService).toContain("dmp_finalize_work_order_technical");
    expect(app).toContain('No se ha podido cargar la economía.');
  });

  it('respeta la visibilidad económica existente', () => {
    expect(canViewWorkOrderCosts({ primary_area: 'Gerencia', roles: [], active: true } as any)).toBe(true);
    expect(canViewWorkOrderCosts({ primary_area: 'Oficina', roles: [], active: true } as any)).toBe(true);
    expect(canViewWorkOrderCosts({ primary_area: 'Tecnico', roles: [], active: true } as any)).toBe(false);
    expect(app).toContain('{showEconomics && <WorkOrderEconomicCard state={economicSummary} />}');
  });

  it('mantiene las ocho pestañas y habilita navegación horizontal en móvil', () => {
    for (const label of ['Resumen', 'Trabajo', 'Checks', 'Horas', 'Materiales', 'Recursos y costes', 'Fotos y firmas', 'Historial']) expect(app).toContain(label);
    expect(styles).toContain('.detail-tabs');
    expect(styles).toContain('overflow-x: auto');
    expect(styles).toContain('white-space: nowrap');
    expect(app).toContain('role="tablist"');
    expect(app).toContain('aria-current={tab === key ? \'page\' : undefined}');
  });

  it('mantiene acciones secundarias bajo Más sin cambiar permisos', () => {
    expect(app).toContain('work-more');
    expect(app).toContain('Más');
    expect(app).toContain('canManageWorkOrderCosts(profile, data)');
    expect(app).toContain('workOrderPurgeCanShowButton(data, workspace)');
    expect(app).toContain('work-more-label');
    expect(app).toContain('Finalizar técnicamente');
    expect(app).not.toContain('disabled={warnings.length');
  });

  it('mantiene operaciones SAT visibles fuera de Más', () => {
    expect(app).toContain("setMode('cost')}>Recursos");
    expect(app).toContain("setTab('media')}>Evidencias");
    expect(app).toContain('workOrderPurgeCanShowButton(data, workspace)');
    expect(app).toContain('SyncButton workOrderId={data.id}');
  });

  it('presenta una variante móvil técnica alimentada por el mismo detalle cargado', () => {
    expect(app).toContain('if (workspace === \'tecnico\') return <TechnicianWorkOrderUx data={data} profile={profile} reload={reload} />;');
    expect(mobileDetail).toContain('workOrderOperationalMetrics(data)');
    expect(mobileDetail).toContain('workOrderDetailWarnings(data)');
    expect(mobileDetail).toContain('workOrderCheckAction(data, canCreateCheck(profile))');
    expect(mobileDetail).toContain('technician-work-order-actions');
    expect(mobileDetail).toContain("setMode('photo')");
    expect(mobileDetail).toContain('WorkOrderPhotoForm workOrderId={data.id}');
    expect(mobileDetail).toContain("setMode('signature')");
    expect(mobileDetail).toContain('WorkOrderSignatureForm workOrderId={data.id}');
    expect(mobileDetail).toContain("setMode('deficiency')");
    expect(mobileDetail).toContain('WorkOrderDeficiencyForm workOrderId={data.id}');
    expect(mobileDetail).not.toMatch(/door|puerta|seccional|barrera|automatismo/i);
  });

  it('mantiene la ejecución técnica sin importes y con avisos no bloqueantes', () => {
    expect(mobileDetail).toContain('technician-pending-list');
    expect(mobileDetail).toContain('WorkOrderStatusSelector');
    expect(mobileDetail).toContain('WorkOrderFinalizeModal');
    expect(mobileDetail).not.toContain('economicService');
    expect(mobileDetail).not.toContain('money(');
    expect(styles).toContain('.technician-work-order-actions');
    expect(styles).toContain('.technician-work-order-menu');
  });

  it('reutiliza el flujo seguro de foto offline sin añadir backend', () => {
    expect(mobileDetail).toContain("setMode('photo')");
    expect(app).toContain("technicianOfflineService.upsert({ type: 'photo', workOrderId");
    expect(workOrdersService).toContain("supabase.rpc('register_work_order_photo'");
  });

  it('conserva el RPC actual de finalización y el modelo genérico de equipos', () => {
    expect(workOrdersService).toContain("supabase.rpc('dmp_finalize_work_order_technical'");
    expect(mobileDetail).toContain('equipmentTypeName(data.primary_equipment)');
    expect(mobileDetail).toContain('Tipo:');
  });

  it('mantiene una presentación compacta para resumen, economía y móvil', () => {
    expect(app).toContain('className={metrics.openDeficiencies === 0 ? \'is-zero\' : \'is-important\'}');
    expect(app).toContain('work-economic-margin');
    expect(styles).toContain('.work-economic-grid');
    expect(styles).toContain('.work-operational-summary .is-zero');
    expect(styles).toContain('.work-primary-actions::-webkit-scrollbar');
  });

  it('conserva los contratos de backend y los permisos económicos', () => {
    expect(workOrdersService).toContain('dmp_finalize_work_order_technical');
    expect(app).toContain('canViewWorkOrderCosts(profile)');
    expect(app).toContain('economicService.workOrderSummary(data.id)');
  });
});
