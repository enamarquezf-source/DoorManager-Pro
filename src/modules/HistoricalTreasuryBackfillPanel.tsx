import { useEffect, useState } from 'react';
import type { Profile } from '../shared/types';
import { hasPermission } from '../auth/permissions';
import { treasuryService, type TreasuryHistoricalBackfillPreview, type TreasuryHistoricalBackfillResult } from '../services/treasuryService';

type TreasuryAccount = { treasury_account_id: string; name: string; currency_code: string; opening_balance_date: string; active: boolean };
const firstRow = <T,>(value: T[] | T | null | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;
const historicalBadgeLabel = 'Histórico anterior al saldo inicial';

export function HistoricalTreasuryBackfillPanel({ profile, onApplied = () => window.dispatchEvent(new Event('treasury:refresh')) }: { profile: Profile | null; onApplied?: () => void }) {
  const canApply = hasPermission(profile, 'treasury.transactions.create')
    && hasPermission(profile, 'billing.write')
    && hasPermission(profile, 'supplier_payments.create');
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [accountId, setAccountId] = useState('');
  const [preview, setPreview] = useState<TreasuryHistoricalBackfillPreview | null>(null);
  const [result, setResult] = useState<TreasuryHistoricalBackfillResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void treasuryService.accounts()
      .then((rows) => setAccounts(rows as TreasuryAccount[]))
      .catch((err) => setError(err instanceof Error ? err.message : 'No se han podido cargar las cuentas.'))
      .finally(() => setLoading(false));
  }, [open]);

  if (!canApply) return null;

  const selectedAccount = accounts.find((account) => account.treasury_account_id === accountId);
  const loadPreview = async () => {
    if (!accountId) { setError('Selecciona una cuenta activa.'); return; }
    setLoading(true); setError(''); setResult(null); setConfirming(false);
    try { setPreview(firstRow(await treasuryService.historicalBackfillPreview(accountId))); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido preparar la preview.'); }
    finally { setLoading(false); }
  };

  const apply = async () => {
    setLoading(true); setError('');
    try {
      setResult(firstRow(await treasuryService.applyHistoricalBackfill(accountId)));
      setConfirming(false);
      setPreview(null);
      onApplied();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido aplicar la regularización.'); }
    finally { setLoading(false); }
  };

  return <>
    <button type="button" onClick={() => { setOpen(true); setError(''); setResult(null); }}>Regularizar históricos</button>
    {open && <div className="mini-modal" role="dialog" aria-modal="true" aria-labelledby="historical-backfill-title">
      <div className="card"><header><div><h3 id="historical-backfill-title">Regularizar históricos</h3><p className="large-note">Los movimientos anteriores a la fecha del saldo inicial se añadirán al historial, pero no modificarán el Saldo DMP actual.</p></div><button type="button" onClick={() => setOpen(false)} disabled={loading}>Cerrar</button></header>
        <div className="form-grid"><label>Cuenta activa *<select value={accountId} onChange={(event) => { setAccountId(event.target.value); setPreview(null); setConfirming(false); setResult(null); }} disabled={loading}><option value="">Selecciona cuenta</option>{accounts.filter((account) => account.active).map((account) => <option key={account.treasury_account_id} value={account.treasury_account_id}>{account.name} · {account.currency_code} · saldo inicial {account.opening_balance_date}</option>)}</select></label></div>
        {!loading && accounts.filter((account) => account.active).length === 0 && <p className="large-note">No hay cuentas activas disponibles.</p>}
        <button type="button" onClick={() => void loadPreview()} disabled={loading || !accountId}>Previsualizar</button>
        {preview && selectedAccount && <><p><strong>Cuenta seleccionada:</strong> {selectedAccount.name} · {preview.currency_code} · <strong>saldo inicial:</strong> {selectedAccount.opening_balance_date}</p><div className="info-grid"><div><dt>Cobros de clientes pendientes</dt><dd>{preview.customer_pending} · {Number(preview.customer_pending_total ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}</dd></div><div><dt>Pagos de proveedores pendientes</dt><dd>{preview.supplier_pending} · {Number(preview.supplier_pending_total ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}</dd></div><div><dt>Movimientos anteriores al saldo inicial</dt><dd>{preview.historical_before_opening_count}</dd></div><div><dt>Afectan al Saldo DMP</dt><dd>{preview.balance_affecting_count}</dd></div><div><dt>Conflictos de moneda</dt><dd>{preview.currency_conflict_count}</dd></div><div><dt>Rango de fechas</dt><dd>{preview.earliest_transaction_date ?? 'Sin movimientos'}{preview.latest_transaction_date ? ` a ${preview.latest_transaction_date}` : ''}</dd></div></div><p className="large-note">La operación es idempotente y no duplicará movimientos ya vinculados.</p>{!confirming ? <button type="button" className="primary" onClick={() => setConfirming(true)} disabled={loading}>Aplicar regularización</button> : <div className="modal-footer"><span>Se crearán los movimientos históricos pendientes en {selectedAccount.name}.</span><button type="button" onClick={() => setConfirming(false)} disabled={loading}>Cancelar</button><button type="button" className="primary" onClick={() => void apply()} disabled={loading}>Aplicar regularización</button></div>}</>}
        {error && <p className="form-error">{error}</p>}{result && <p className="success-note">Regularización aplicada: {result.customer_inserted} cobros vinculados, {result.supplier_inserted} pagos vinculados, {result.customer_skipped + result.supplier_skipped} ya vinculados/omitidos, {result.historical_before_opening_count} históricos y {result.balance_affecting_count} movimientos que afectan al saldo. <span className="status-badge muted">{historicalBadgeLabel}</span></p>}
      </div>
    </div>}
  </>;
}
