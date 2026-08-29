import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd());
const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
const permissions = readFileSync(resolve(root, 'src/auth/permissions.ts'), 'utf8');
const service = readFileSync(resolve(root, 'src/services/workOrdersService.ts'), 'utf8');

describe('commercial review detail UX', () => {
  it('renders the existing commercial review flow for pending routed work', () => {
    expect(app).toContain("workOrder.sat_review_destination !== 'comercial' || workOrder.commercial_review_status !== 'pending'");
    expect(app).toContain('REVISIÓN COMERCIAL');
    expect(app).toContain('REVISIÓN SAT');
    expect(app).toContain('Observaciones comerciales *');
    expect(app).toContain('ENVIAR A FACTURACIÓN');
  });

  it('uses the existing RPC and preserves assignment-aware approval', () => {
    expect(service).toContain("dmp_review_work_order_commercial");
    expect(app).toContain('workOrder.current_responsible_id === profile?.id');
    expect(app).toContain('Parte asignado a otro Comercial');
  });

  it('hides unusable technical actions without changing permissions', () => {
    expect(app).toContain('disabled={!canManageWorkOrderTime(profile, data)}');
    expect(app).toContain('disabled={!canManageWorkOrderMaterials(profile, data)}');
    expect(app).toContain('disabled={!canManageWorkOrderCosts(profile, data)}');
    expect(app).toContain('disabled={!canEditWorkOrder(profile, data)}');
    expect(readFileSync(resolve(root, 'src/styles.css'), 'utf8')).toContain('.work-actions button:disabled { display: none; }');
    expect(permissions).toContain("hasAny(profile, ['Comercial'])");
  });

  it('does not invent a commercial return-to-SAT RPC', () => {
    expect(service).not.toContain('returnWorkOrderCommercial');
    expect(app).not.toContain('DEVOLVER A SAT');
  });
});
