import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const service = readFileSync(new URL('./workOrdersService.ts', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('./dashboardService.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const initialSchema = readFileSync(new URL('../../supabase/migrations/001_initial_dmp_schema.sql', import.meta.url), 'utf8');
const multiEquipmentMigration = readFileSync(new URL('../../supabase/migrations/082_multi_equipment_work_orders.sql', import.meta.url), 'utf8');
const workOrderEquipmentSchema = initialSchema.slice(initialSchema.indexOf('create table public.work_order_equipment'), initialSchema.indexOf('create table public.work_order_assignments'));

describe('work order performance foundation', () => {
  it('keeps list payload explicit and provides a lightweight summary', () => {
    expect(service).toContain("select('id,company_id,code,title,description,type,priority,status,origin,scheduled_date,scheduled_time,case_code,client_code,client_name,site_code,site_name,equipment_code,equipment_type,main_technician_name,created_by_name,deleted_at')");
    expect(service).toContain('async getWorkOrderSummary(workOrderId: string, technicianOnly = false)');
    expect(service).toContain('const officeValidationAvailable = await this.hasOfficeValidation()');
    expect(service).toContain("const officeValidationColumns = officeValidationAvailable ? 'office_validation_status, office_validation_reason,' : ''");
    expect(service).toContain('id,company_id,code,title,description,type,priority,status,origin,scheduled_date,scheduled_time');
    expect(service).not.toMatch(/getWorkOrderSummary[\s\S]{0,500}check_photos/);
  });

  it('uses the composite work-order/equipment key for associated equipment', () => {
    const associatedProjection = "select('work_order_id,equipment_id,is_primary,check_status,equipment!work_order_equipment_equipment_id_fkey";
    expect(service).toContain(associatedProjection);
    expect(service).not.toContain("from('work_order_equipment').select('id,");
    expect(workOrderEquipmentSchema).toContain('work_order_id uuid not null');
    expect(workOrderEquipmentSchema).toContain('equipment_id uuid not null');
    expect(workOrderEquipmentSchema).toContain('is_primary boolean not null');
    expect(workOrderEquipmentSchema).toContain('created_at timestamptz not null default now()');
    expect(workOrderEquipmentSchema).toContain('primary key (work_order_id, equipment_id)');
    expect(multiEquipmentMigration).toContain("add column if not exists check_status text not null default 'not_applicable'");
  });

  it('runs independent SAT dashboard reads in parallel', () => {
    const method = dashboard.slice(dashboard.indexOf('async getSatDashboardData'), dashboard.indexOf('async getCommercialDashboardData'));
    expect(method).toContain('const [workOrders, assignments, technicians, pendingChecks, completedChecks, deficiencies, alerts, materials] = await Promise.all');
    expect(method).toContain("select('id,company_id,code,title,status,scheduled_date,scheduled_time,priority,type,description,client_name,site_name,equipment_code,main_technician_name,created_by_name,deleted_at')");
    expect(method).not.toContain('creator_name');
    expect(method).not.toContain(',planned_material,');
  });

  it('defers the heavy detail query until a secondary tab is requested', () => {
    expect(app).toContain('useWorkOrderSummary(companyId, id, workspace === \'tecnico\')');
    expect(app).toContain("useWorkOrderDetail(companyId, id, tab !== 'resumen', workspace === 'tecnico')");
    expect(app).toContain("const tabs = [['resumen','Resumen']");
  });
});
