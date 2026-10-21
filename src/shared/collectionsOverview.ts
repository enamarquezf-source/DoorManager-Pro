export type CollectionBucket = 'overdue' | 'today' | 'soon' | 'later' | 'undated';
export type CollectionInvoice = { id: string; status: string; total_amount?: unknown; paid_amount?: unknown; due_date?: string | null; code?: string; clients?: {legal_name?: string} | null; [key: string]: any };
export type CollectionItem = { invoice: CollectionInvoice; amount: number; due: string | null; bucket: CollectionBucket; daysLate: number };
const dayMs = 86400000;
const cents = (value: unknown) => { const number = Number(value ?? 0); return Number.isFinite(number) ? Math.round(number * 100) : 0; };
export function validDateKey(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value ? value : null;
}
export function addCollectionDays(day: string, count: number) { return new Date(Date.parse(`${day}T00:00:00Z`) + count * dayMs).toISOString().slice(0,10); }
export function outstandingAmount(invoice: CollectionInvoice) { return Math.max(cents(invoice.total_amount) - cents(invoice.paid_amount), 0) / 100; }
export function collectionItems(invoices: CollectionInvoice[], today: string): CollectionItem[] {
  if (!validDateKey(today)) throw new Error('Fecha de consulta no válida');
  const soon = addCollectionDays(today,7);
  return invoices.flatMap(invoice => {
    const amount = outstandingAmount(invoice);
    if (['borrador','cancelada'].includes(invoice.status) || amount <= 0) return [];
    const due = validDateKey(invoice.due_date);
    const bucket: CollectionBucket = !due ? 'undated' : due < today ? 'overdue' : due === today ? 'today' : due <= soon ? 'soon' : 'later';
    const daysLate = due && due < today ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / dayMs) : 0;
    return [{invoice,amount,due,bucket,daysLate}];
  }).sort((a,b) => (a.due ?? '9999-12-31').localeCompare(b.due ?? '9999-12-31') || String(a.invoice.code ?? a.invoice.id).localeCompare(String(b.invoice.code ?? b.invoice.id)));
}
export function collectionTotals(items: CollectionItem[]) { return {count: items.length,amount: items.reduce((sum,item) => sum + cents(item.amount),0) / 100}; }
export function collectionMonth(month: string) {
  const first = validDateKey(`${month.slice(0,7)}-01`);
  if (!first) throw new Error('Mes no válido');
  const date = new Date(`${first}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  const start = addCollectionDays(first,-offset);
  return Array.from({length:42},(_,index) => addCollectionDays(start,index));
}
export function moveCollectionMonth(month: string, count: number) {
  const date = new Date(`${month.slice(0,7)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + count);
  return date.toISOString().slice(0,7);
}
