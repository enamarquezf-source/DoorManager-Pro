import { supabase } from '../lib/supabase/client';
import { expectData } from './query';

const context = (operation: string, resource?: string) => ({ service: 'treasuryService', operation, resource });

export type TreasuryHistoricalBackfillPreview = {
  treasury_account_id: string;
  currency_code: string;
  customer_pending: number;
  customer_pending_total: number;
  supplier_pending: number;
  supplier_pending_total: number;
  historical_before_opening_count: number;
  balance_affecting_count: number;
  currency_conflict_count: number;
  earliest_transaction_date: string | null;
  latest_transaction_date: string | null;
};

export type TreasuryHistoricalBackfillResult = {
  customer_inserted: number;
  supplier_inserted: number;
  customer_skipped: number;
  supplier_skipped: number;
  historical_before_opening_count: number;
  balance_affecting_count: number;
};

export type TreasuryTransaction = {
  id: string;
  treasury_account_id: string;
  transaction_date: string;
  direction: 'inflow' | 'outflow';
  amount: number;
  currency_code: string;
  concept?: string | null;
  notes?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  transfer_group_id?: string | null;
  method?: string | null;
  reference?: string | null;
  reversed_at?: string | null;
  created_at?: string | null;
  customer_payment?: TreasuryCustomerPayment | null;
  supplier_payment?: TreasurySupplierPayment | null;
};

export type TreasuryCustomerPayment = {
  id: string;
  invoice_id: string;
  paid_at: string;
  amount: number;
  method?: string | null;
  reference?: string | null;
  notes?: string | null;
  invoices?: { id: string; code: string; client_id: string; clients?: { id: string; code?: string | null; legal_name?: string | null } | null } | null;
};

export type TreasurySupplierPayment = {
  id: string;
  supplier_invoice_id: string;
  payment_date: string;
  amount: number;
  payment_method?: string | null;
  reference?: string | null;
  notes?: string | null;
  supplier_invoices?: { id: string; code: string; supplier_invoice_number?: string | null; supplier_id: string; suppliers?: { id: string; name?: string | null } | null } | null;
};

async function enrichTransactions(rows: TreasuryTransaction[]) {
  const customerIds = [...new Set(rows.filter((row) => row.source_type === 'customer_payment' && row.source_id).map((row) => row.source_id as string))];
  const supplierIds = [...new Set(rows.filter((row) => row.source_type === 'supplier_payment' && row.source_id).map((row) => row.source_id as string))];
  const [customerRows, supplierRows] = await Promise.all([
    customerIds.length ? expectData<any[]>(supabase.from('invoice_payments').select('id,invoice_id,paid_at,amount,method,reference,notes,invoices(id,code,client_id,clients(id,code,legal_name))').in('id', customerIds), context('resolve treasury customer payments')) : [],
    supplierIds.length ? expectData<any[]>(supabase.from('supplier_invoice_payments').select('id,supplier_invoice_id,payment_date,amount,payment_method,reference,notes,supplier_invoices(id,code,supplier_invoice_number,supplier_id,suppliers(id,name))').in('id', supplierIds), context('resolve treasury supplier payments')) : [],
  ]);
  const customerPayments: TreasuryCustomerPayment[] = customerRows.map((payment: any) => ({ ...payment, invoices: Array.isArray(payment.invoices) ? { ...payment.invoices[0], clients: Array.isArray(payment.invoices[0]?.clients) ? payment.invoices[0].clients[0] ?? null : payment.invoices[0]?.clients ?? null } : payment.invoices ?? null }));
  const supplierPayments: TreasurySupplierPayment[] = supplierRows.map((payment: any) => ({ ...payment, supplier_invoices: Array.isArray(payment.supplier_invoices) ? { ...payment.supplier_invoices[0], suppliers: Array.isArray(payment.supplier_invoices[0]?.suppliers) ? payment.supplier_invoices[0].suppliers[0] ?? null : payment.supplier_invoices[0]?.suppliers ?? null } : payment.supplier_invoices ?? null }));
  const customerById = new Map<string, TreasuryCustomerPayment>(customerPayments.map((payment) => [payment.id, payment]));
  const supplierById = new Map<string, TreasurySupplierPayment>(supplierPayments.map((payment) => [payment.id, payment]));
  return rows.map((row) => ({ ...row, customer_payment: row.source_type === 'customer_payment' ? customerById.get(row.source_id ?? '') ?? null : null, supplier_payment: row.source_type === 'supplier_payment' ? supplierById.get(row.source_id ?? '') ?? null : null }));
}

export const treasuryService = {
  accounts() {
    return expectData<any[]>(supabase.from('treasury_account_balances').select('*').order('name'), context('list treasury accounts'));
  },
  transactions(accountId?: string, page = 0, pageSize = 50) {
    let query = supabase.from('treasury_transactions').select('*', { count: 'exact' }).order('transaction_date', { ascending: false }).order('created_at', { ascending: false }).range(page * pageSize, (page + 1) * pageSize - 1);
    if (accountId) query = query.eq('treasury_account_id', accountId);
    return expectData<TreasuryTransaction[]>(query, context('list treasury transactions')).then(enrichTransactions);
  },
  createAccount(payload: { name: string; account_type: string; iban?: string; currency_code: string; opening_balance: number; opening_balance_date: string; notes?: string }) {
    return expectData<string>(supabase.rpc('dmp_create_treasury_account', { p_name: payload.name, p_account_type: payload.account_type, p_iban: payload.iban || null, p_currency_code: payload.currency_code, p_opening_balance: payload.opening_balance, p_opening_balance_date: payload.opening_balance_date, p_notes: payload.notes || null }), context('create treasury account'));
  },
  updateAccount(id: string, payload: { name: string; account_type: string; iban?: string; active: boolean; notes?: string }) {
    return expectData<string>(supabase.rpc('dmp_update_treasury_account', { p_account_id: id, p_name: payload.name, p_account_type: payload.account_type, p_iban: payload.iban || null, p_active: payload.active, p_notes: payload.notes || null }), context('update treasury account', id));
  },
  manual(payload: { accountId: string; direction: 'inflow' | 'outflow'; amount: number; date: string; concept: string; reference?: string }) {
    return expectData<string>(supabase.rpc('dmp_record_treasury_manual_movement', { p_account_id: payload.accountId, p_direction: payload.direction, p_amount: payload.amount, p_date: payload.date, p_method: null, p_reference: payload.reference || null, p_notes: payload.concept }), context('record manual treasury movement'));
  },
  transfer(payload: { fromAccountId: string; toAccountId: string; amount: number; date: string; reference?: string; notes?: string }) {
    return expectData<string>(supabase.rpc('dmp_transfer_treasury', { p_from_account_id: payload.fromAccountId, p_to_account_id: payload.toAccountId, p_amount: payload.amount, p_date: payload.date, p_reference: payload.reference || null, p_notes: payload.notes || null }), context('transfer treasury funds'));
  },
  reverse(id: string, reason: string) {
    return expectData<string>(supabase.rpc('dmp_treasury_reverse', { p_transaction_id: id, p_reason: reason }), context('reverse manual treasury movement', id));
  },
  reverseTransfer(groupId: string, reason: string) {
    return expectData<string>(supabase.rpc('dmp_reverse_treasury_transfer', { p_transfer_group_id: groupId, p_reason: reason }), context('reverse treasury transfer', groupId));
  },
  historicalBackfillPreview(accountId: string) {
    return expectData<TreasuryHistoricalBackfillPreview[]>(supabase.rpc('dmp_preview_treasury_historical_backfill', { p_treasury_account_id: accountId }), context('preview treasury historical backfill', accountId));
  },
  applyHistoricalBackfill(accountId: string) {
    return expectData<TreasuryHistoricalBackfillResult[]>(supabase.rpc('dmp_apply_treasury_historical_backfill', { p_treasury_account_id: accountId }), context('apply treasury historical backfill', accountId));
  },
};
