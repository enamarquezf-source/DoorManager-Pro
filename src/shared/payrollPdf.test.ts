import { mkdirSync, writeFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';
import { defaultPayroll } from './employeeHr';
import { payrollSimulationPdf } from './payrollPdf';
describe('beta payroll PDF',()=>{
 it('generates a marked PDF sample from the same arithmetic used in the app',async()=>{
  const pdf=await payrollSimulationPdf('Ana García López','DMP Empresa de prueba','2026-10-01','2026-10-31',{...defaultPayroll(),salary_base:1800,supplements:200,overtime_hours:10,overtime_hourly_price:15,employee_deductions:300,employer_contributions:650,other_employer_costs:50,notes:'Simulación para comprobar costes del equipo.'});
  const buffer=Buffer.from(await pdf.arrayBuffer());expect(buffer.subarray(0,5).toString()).toBe('%PDF-');
  mkdirSync('node_modules/.cache/dmp-hr-qa',{recursive:true});writeFileSync('node_modules/.cache/dmp-hr-qa/simulacion.pdf',buffer);
 });
 it('does not issue generated documents as official payroll',async()=>{
  await expect(payrollSimulationPdf('Ana','DMP','2026-10-01','2026-10-31',{...defaultPayroll(),mode:'actual'})).rejects.toThrow(/exclusivamente simulaciones/);
 });
});
