import { expect,it } from 'vitest';
import { movePlanningDate,planningDays,planningEntries } from './planningCalendar';
it('uses Monday first and local dates across month and year boundaries',()=>{
 expect(planningDays('2026-11-08','week')).toEqual(['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07','2026-11-08']);
 expect(planningDays('2026-11-08','month')[0]).toBe('2026-10-26');
 expect(planningDays('2026-11-08','month')).toHaveLength(42);
 expect(movePlanningDate('2026-01-31','month',1)).toBe('2026-02-01');
 expect(movePlanningDate('2026-12-31','week',1)).toBe('2027-01-07');
});
it('shows actual assignment dates per technician rather than duplicating the scheduled work date',()=>{
 const rows=planningEntries([{id:'work',scheduled_date:'2026-11-01',assignments:[{id:'a',technician_id:'one',assignment_date:'2026-11-03',planned_start_time:'09:00',profiles:{first_name:'Ana'}},{id:'b',technician_id:'two',assignment_date:'2026-11-04'},{technician_id:'three',assignment_date:'2026-11-05',status:'Cancelado'}]},{id:'unassigned',scheduled_date:'2026-11-03'},{id:'undated'}]);
 expect(rows.map(row=>[row.work.id,row.date,row.technicianId])).toEqual([['unassigned','2026-11-03',''],['work','2026-11-03','one'],['work','2026-11-04','two']]);
 expect(rows.find(row=>row.technicianId==='one')?.name).toBe('Ana');
});
