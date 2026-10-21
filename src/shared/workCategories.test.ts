import { describe,expect,it } from 'vitest';
import { maintenanceDates,monthDate,workCategory } from './workCategories';
describe('work categories and maintenance calendar',()=>{
 it('groups existing types without rewriting historic work orders or hiding visits',()=>{expect(workCategory('Preventivo')).toBe('maintenance');expect(workCategory('Mantenimiento')).toBe('maintenance');expect(workCategory('Instalacion')).toBe('new_work');expect(workCategory('Garantia')).toBe('repair');expect(workCategory('Mejora')).toBe('improvement');expect(workCategory('Visita comercial')).toBe('other');});
 it('keeps original month-end anchors, including leap years',()=>{expect(maintenanceDates('2026-01-31','2026-04-30','2026-01-31',1)).toEqual(['2026-01-31','2026-02-28','2026-03-31','2026-04-30']);expect(monthDate('2024-02-29',12)).toBe('2025-02-28');});
 it('plans four quarterly visits within an annual contract',()=>{expect(maintenanceDates('2026-01-01','2026-12-31','2026-01-01',3)).toEqual(['2026-01-01','2026-04-01','2026-07-01','2026-10-01']);});
 it('deduplicates and sorts explicit dates and rejects invalid recurrence or a first visit outside the contract',()=>{expect(maintenanceDates('2026-01-01','2026-12-31','',0,['2026-07-01','2026-02-01','2026-07-01'])).toEqual(['2026-02-01','2026-07-01']);expect(maintenanceDates('2026-01-01','2026-12-31','2025-12-31',3)).toEqual([]);expect(maintenanceDates('2026-01-01','2026-12-31','2026-01-01',7)).toEqual([]);});
});
