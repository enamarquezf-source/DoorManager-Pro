import { describe,expect,it } from 'vitest';
import { automaticStudyPayroll,defaultPayroll,payrollAmounts,payrollInputsForStudy,type HrRecord } from './employeeHr';
import { calculateCostStudy,emptyStudyInputs,emptyStudySources } from './costStudy';
describe('beta payroll arithmetic',()=>{
 it('distinguishes gross, net, overtime and full employer cost without deducting withholding from company cost',()=>{
  expect(payrollAmounts({...defaultPayroll(),salary_base:1800,supplements:200,overtime_hours:10,overtime_hourly_price:15,employee_deductions:300,employer_contributions:650,other_employer_costs:50})).toEqual({overtime_amount:150,gross_amount:2150,net_amount:1850,employer_cost:2850});
 });
 it('rounds money to cents and rejects excessive deductions, negative inputs or impossible extra hours',()=>{
  expect(payrollAmounts({...defaultPayroll(),salary_base:0.1,supplements:0.2}).gross_amount).toBe(0.3);
  expect(()=>payrollAmounts({...defaultPayroll(),employee_deductions:1})).toThrow();
  expect(()=>payrollAmounts({...defaultPayroll(),overtime_hours:-1})).toThrow();
  expect(()=>payrollAmounts({...defaultPayroll(),overtime_hours:745})).toThrow();
 });
});

describe('automatic payroll in company totals',()=>{
 it('sums payroll for two technicians, including one with no time entries, without adding their time costs twice',()=>{
  const a=record('a','2026-10-01','2026-10-31','simulation');
  const b={...record('b','2026-10-01','2026-10-31','simulation'),profile_id:'q',payload:{mode:'simulation',employer_cost:3000}};
  const sources={...emptyStudySources(),time_entries:[{id:'t',profile_id:'p',work_order_id:'w',work_date:'2026-10-05',duration_minutes:60,hour_type:'normal',total_cost:50}]};
  const imported=automaticStudyPayroll([a,b],'2026-10-01','2026-10-31','auto',sources.time_entries);
  const inputs={...emptyStudyInputs(),employees:imported.employees.map(row=>({...row,standard_completed_hours:null,standard_basis:''}))};
  expect(imported).toMatchObject({recordCount:2,simulationCount:2,payrollTotal:5000});
  expect(calculateCostStudy(sources,inputs)).toMatchObject({labourCost:5000,totalCost:5000,missingPayroll:0});
 });
 it('prefers actual over simulation for the same person and month',()=>{
  const actual=record('a','2026-10-01','2026-10-31');
  const simulation={...record('b','2026-10-01','2026-10-31','simulation'),payload:{mode:'simulation',employer_cost:9999}};
  expect(automaticStudyPayroll([actual,simulation],'2026-10-01','2026-10-31','auto',[])).toMatchObject({recordCount:1,actualCount:1,simulationCount:0,payrollTotal:2000});
  expect(automaticStudyPayroll([actual,simulation],'2026-10-01','2026-10-31','simulation',[]).payrollTotal).toBe(9999);
 });
 it('retains valued time outside payroll months and flags missing coverage rather than discarding known payroll',()=>{
  const imported=automaticStudyPayroll([record('a','2026-10-01','2026-10-31')],'2026-09-01','2026-10-31','actual',[{profile_id:'p',work_date:'2026-09-05',total_cost:70},{profile_id:'p',work_date:'2026-10-05',total_cost:80}]);
  expect(imported.employees[0]).toMatchObject({payroll_cost:2070,payroll_partial:true,paid_hours:null,presence_hours:null});
 });
 it('does not put an entire monthly payroll into a custom partial-month range',()=>{
  expect(automaticStudyPayroll([record('a','2026-10-01','2026-10-31')],'2026-10-01','2026-10-21','auto',[]).recordCount).toBe(0);
 });
});
const record=(id:string,from:string,to:string,mode='actual'):HrRecord=>({id,profile_id:'p',kind:'payroll',date_from:from,date_to:to,payload:{mode,employer_cost:2000,paid_hours:160,presence_hours:null},file_path:null,filename:null,created_at:from});
describe('importing payroll into studies',()=>{
 it('requires exact continuous coverage and never mixes actual payroll and simulations',()=>{
  const rows=[record('a','2026-09-01','2026-09-30'),record('b','2026-10-01','2026-10-31'),record('c','2026-10-01','2026-10-31','simulation')];
  expect(payrollInputsForStudy(rows,'2026-09-01','2026-10-31','actual')).toEqual([{profile_id:'p',payroll_cost:4000,paid_hours:320,presence_hours:null}]);
  expect(payrollInputsForStudy(rows,'2026-10-01','2026-10-31','simulation')[0].payroll_cost).toBe(2000);
  expect(payrollInputsForStudy(rows,'2026-10-01','2026-10-21','actual')).toEqual([]);
  expect(payrollInputsForStudy(rows,'2026-08-01','2026-10-31','actual')).toEqual([]);
 });
 it('rejects overlapping duplicate payroll periods instead of doubling costs',()=>{
  expect(payrollInputsForStudy([record('a','2026-10-01','2026-10-31'),record('b','2026-10-01','2026-10-31')],'2026-10-01','2026-10-31','actual')).toEqual([]);
 });
});
