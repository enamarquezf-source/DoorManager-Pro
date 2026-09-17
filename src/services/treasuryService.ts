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
  reversed_at?: string | null;
  created_at?: string | null;
};

export const treasuryService = {
  accounts() {
    return expectData<any[]>(supabase.from('treasury_account_balances').select('*').order('name'), context('list treasury accounts'));
  },
  transactions(accountId?: string, page = 0, pageSize = 50) {
    let query = supabase.from('treasury_transactions').select('*', { count: 'exact' }).order('transaction_date', { ascending: false }).order('created_at', { ascending: false }).range(page * pageSize, (page + 1) * pageSize - 1);
    if (accountId) query = query.eq('treasury_account_id', accountId);
    return expectData<TreasuryTransaction[]>(query, context('list treasury transactions'));
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
