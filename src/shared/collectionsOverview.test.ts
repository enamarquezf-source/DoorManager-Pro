import { describe,expect,it } from 'vitest';
import { collectionItems,collectionTotals,collectionMonth,moveCollectionMonth,outstandingAmount,validDateKey } from './collectionsOverview';
const invoice=(id:string,due_date:string|null,total_amount=100,paid_amount=0,status='emitida')=>({id,due_date,total_amount,paid_amount,status});
describe('collections overview',()=>{
 it('separates overdue, today, next seven days, later and missing dates',()=>{
  const rows=collectionItems([invoice('a','2026-10-20'),invoice('b','2026-10-21'),invoice('c','2026-10-28'),invoice('d','2026-10-29'),invoice('e',null)],'2026-10-21');
  expect(rows.map(row=>row.bucket)).toEqual(['overdue','today','soon','later','undated']);expect(rows[0].daysLate).toBe(1);
 });
 it('counts outstanding cents only and ignores drafts, cancelled, paid and overpaid invoices',()=>{
  const rows=collectionItems([invoice('a',null,100,30),invoice('b',null,100,0,'borrador'),invoice('c',null,100,0,'cancelada'),invoice('d',null,100,100),invoice('e',null,100,101)],'2026-10-21');
  expect(collectionTotals(rows)).toEqual({count:1,amount:70});expect(outstandingAmount(invoice('x',null,0.3,0.1))).toBe(0.2);
 });
 it('handles daylight saving and leap dates without shifting due dates',()=>{
  expect(collectionItems([invoice('a','2026-10-24')],'2026-10-26')[0].daysLate).toBe(2);
  expect(validDateKey('2024-02-29')).toBe('2024-02-29');expect(validDateKey('2026-02-29')).toBeNull();
  expect(collectionItems([invoice('bad','2026-02-30')],'2026-10-21')[0].bucket).toBe('undated');
 });
 it('builds Monday-first calendars and moves months across year boundaries',()=>{
  expect(collectionMonth('2026-11')).toHaveLength(42);expect(collectionMonth('2026-11')[0]).toBe('2026-10-26');
  expect(moveCollectionMonth('2026-12',1)).toBe('2027-01');expect(moveCollectionMonth('2026-01',-1)).toBe('2025-12');
 });
});
