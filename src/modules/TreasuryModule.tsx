import { useEffect, useState, type FormEvent } from 'react';
import type { Profile } from '../shared/types';
import { hasPermission } from '../auth/permissions';
import { treasuryService, type TreasuryTransaction } from '../services/treasuryService';
import { HistoricalTreasuryBackfillPanel } from './HistoricalTreasuryBackfillPanel';

const money = (value: unknown, currency = 'EUR') => `${Number(value ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency === 'EUR' ? '€' : currency}`;
const date = (value: string | null | undefined) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-ES') : 'Sin fecha';
const today = () => new Date().toISOString().slice(0, 10);

type Account = { treasury_account_id: string; name: string; account_type: string; currency_code: string; opening_balance_date: string; balance: number; active: boolean };
type DisplayTransaction = TreasuryTransaction & { account_name: string; opening_balance_date: string; historical: boolean };

function TreasuryModuleContent({ profile }: { profile: Profile | null }) {
  const canRead = hasPermission(profile, 'treasury.read');
  const canCreateAccount = hasPermission(profile, 'treasury.accounts.create');
  const canUpdateAccount = hasPermission(profile, 'treasury.accounts.update');
  const canCreateMovement = hasPermission(profile, 'treasury.transactions.create');
  const canTransfer = hasPermission(profile, 'treasury.transfers.create');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rows, setRows] = useState<DisplayTransaction[]>([]);
  const [error, setError] = useState('');
  const [accountForm, setAccountForm] = useState(false);
  const [movementForm, setMovementForm] = useState(false);
  const [transferForm, setTransferForm] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const load = async (nextPage = page) => {
    try {
      setError('');
      const [nextAccounts, nextRows] = await Promise.all([treasuryService.accounts(), treasuryService.transactions(undefined, nextPage)]);
      const typedAccounts = nextAccounts as Account[];
      const accountById = new Map(typedAccounts.map((account) => [account.treasury_account_id, account]));
      setAccounts(typedAccounts);
      setRows(nextRows.map((row) => {
        const account = accountById.get(row.treasury_account_id);
        return { ...row, account_name: account?.name ?? 'Cuenta no informada', opening_balance_date: account?.opening_balance_date ?? '', historical: !!account?.opening_balance_date && row.transaction_date < account.opening_balance_date };
      }));
      setHasMore(nextRows.length === 50);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido cargar Tesorería.'); }
  };

  useEffect(() => { if (canRead) void load(0); }, [canRead]);
  useEffect(() => { const refreshHandler = () => { void load(page); }; window.addEventListener('treasury:refresh', refreshHandler); return () => window.removeEventListener('treasury:refresh', refreshHandler); }, [page]);
  if (!canRead) return null;

  const totals = accounts.reduce<Record<string, number>>((sum, account) => { sum[account.currency_code] = (sum[account.currency_code] ?? 0) + Number(account.balance ?? 0); return sum; }, {});
  const refresh = () => { setAccountForm(false); setMovementForm(false); setTransferForm(false); void load(page); };
  const changePage = (nextPage: number) => { setPage(nextPage); void load(nextPage); };

  return <section className="page treasury-page">
    <div className="page-head"><div><p className="eyebrow">Economía · Control de dinero</p><h2>Tesorería</h2><p>Saldo DMP calculado a partir de los movimientos registrados en DoorManager Pro. No es saldo bancario conciliado.</p></div><div className="actions">{canCreateAccount && <button onClick={() => setAccountForm(true)}>Nueva cuenta</button>}{canCreateMovement && <button onClick={() => setMovementForm(true)}>Nuevo movimiento</button>}{canTransfer && <button className="primary" onClick={() => setTransferForm(true)}>Transferir</button>}</div></div>
    {error && <p className="form-error">{error}</p>}
    <div className="stats-grid">{Object.entries(totals).map(([currency, value]) => <div className="metric ok" key={currency}><span>Saldo DMP · {currency}</span><strong>{money(value, currency)}</strong><small>Saldo operativo derivado</small></div>)}{!Object.keys(totals).length && <div className="metric info"><span>Saldo DMP</span><strong>0,00 €</strong><small>Crea una cuenta para empezar</small></div>}</div>
    <section className="card"><header><h3>Cuentas</h3></header>{accounts.length ? <div className="record-list">{accounts.map((account) => <article key={account.treasury_account_id}><div><strong>{account.name}</strong><p>{account.account_type === 'bank' ? 'Banco' : 'Caja'} · {account.currency_code} · {account.active ? 'Activa' : 'Inactiva'}</p><p>Saldo DMP: {money(account.balance, account.currency_code)}</p></div>{canUpdateAccount && <button onClick={async () => { try { await treasuryService.updateAccount(account.treasury_account_id, { name: account.name, account_type: account.account_type, active: !account.active }); refresh(); } catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido actualizar la cuenta.'); } }}>{account.active ? 'Desactivar' : 'Reactivar'}</button>}</article>)}</div> : <p className="large-note">No hay cuentas de empresa.</p>}</section>
    <section className="card"><header><h3>Movimientos recientes</h3></header>{rows.length ? <div className="record-list">{rows.map((row) => <article key={row.id}><div><strong>{date(row.transaction_date)} · {row.direction === 'inflow' ? 'Entrada' : 'Salida'} · {money(row.amount, row.currency_code)}</strong><p>{row.account_name} · {row.concept ?? row.notes ?? 'Movimiento de tesorería'}</p>{row.reversed_at && <span className="status-badge muted">Revertido</span>}{row.historical && <span className="status-badge muted">Histórico anterior al saldo inicial</span>}</div></article>)}</div> : <p className="large-note">No hay movimientos registrados.</p>}<div className="modal-footer"><button type="button" onClick={() => changePage(page - 1)} disabled={page === 0}>Anterior</button><span>Página {page + 1}</span><button type="button" onClick={() => changePage(page + 1)} disabled={!hasMore}>Siguiente</button></div></section>
    {accountForm && <AccountForm onClose={() => setAccountForm(false)} onSaved={refresh} />}{movementForm && <MovementForm accounts={accounts} onClose={() => setMovementForm(false)} onSaved={refresh} />}{transferForm && <TransferForm accounts={accounts} onClose={() => setTransferForm(false)} onSaved={refresh} />}
  </section>;
}

function AccountForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) { const [value, setValue] = useState({ name: '', account_type: 'bank', iban: '', currency_code: 'EUR', opening_balance: '0', opening_balance_date: today(), notes: '' }); const [error, setError] = useState(''); const submit = async (event: FormEvent) => { event.preventDefault(); try { await treasuryService.createAccount({ ...value, opening_balance: Number(value.opening_balance) }); onSaved(); } catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido crear la cuenta.'); } }; return <div className="mini-modal"><form onSubmit={submit}><h3>Nueva cuenta de empresa</h3><div className="form-grid"><label>Nombre *<input value={value.name} onChange={(e) => setValue({ ...value, name: e.target.value })} required /></label><label>Tipo<select value={value.account_type} onChange={(e) => setValue({ ...value, account_type: e.target.value })}><option value="bank">Banco</option><option value="cash">Caja</option></select></label><label>IBAN<input value={value.iban} onChange={(e) => setValue({ ...value, iban: e.target.value })} /></label><label>Moneda<input value={value.currency_code} maxLength={3} onChange={(e) => setValue({ ...value, currency_code: e.target.value.toUpperCase() })} required /></label><label>Saldo inicial<input type="number" step="0.01" value={value.opening_balance} onChange={(e) => setValue({ ...value, opening_balance: e.target.value })} /></label><label>Fecha saldo inicial<input type="date" value={value.opening_balance_date} onChange={(e) => setValue({ ...value, opening_balance_date: e.target.value })} required /></label></div>{error && <p className="form-error">{error}</p>}<div className="modal-footer"><button type="button" onClick={onClose}>Cancelar</button><button className="primary">Crear cuenta</button></div></form></div>; }
function MovementForm({ accounts, onClose, onSaved }: { accounts: Account[]; onClose: () => void; onSaved: () => void }) { const [value, setValue] = useState({ accountId: '', direction: 'outflow' as 'inflow' | 'outflow', amount: '', date: today(), concept: '', reference: '' }); const [error, setError] = useState(''); const submit = async (event: FormEvent) => { event.preventDefault(); try { await treasuryService.manual({ ...value, amount: Number(value.amount) }); onSaved(); } catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido registrar el movimiento.'); } }; return <div className="mini-modal"><form onSubmit={submit}><h3>Nuevo movimiento manual</h3><div className="form-grid"><label>Cuenta *<select value={value.accountId} onChange={(e) => setValue({ ...value, accountId: e.target.value })} required><option value="">Selecciona cuenta</option>{accounts.filter((a) => a.active).map((a) => <option key={a.treasury_account_id} value={a.treasury_account_id}>{a.name} · {a.currency_code}</option>)}</select></label><label>Tipo<select value={value.direction} onChange={(e) => setValue({ ...value, direction: e.target.value as 'inflow' | 'outflow' })}><option value="inflow">Entrada</option><option value="outflow">Salida</option></select></label><label>Importe<input type="number" min="0.01" step="0.01" value={value.amount} onChange={(e) => setValue({ ...value, amount: e.target.value })} required /></label><label>Fecha<input type="date" value={value.date} onChange={(e) => setValue({ ...value, date: e.target.value })} required /></label></div><label>Concepto / motivo *<input value={value.concept} onChange={(e) => setValue({ ...value, concept: e.target.value })} required /></label><label>Referencia<input value={value.reference} onChange={(e) => setValue({ ...value, reference: e.target.value })} /></label>{error && <p className="form-error">{error}</p>}<div className="modal-footer"><button type="button" onClick={onClose}>Cancelar</button><button className="primary">Registrar</button></div></form></div>; }
function TransferForm({ accounts, onClose, onSaved }: { accounts: Account[]; onClose: () => void; onSaved: () => void }) { const [value, setValue] = useState({ fromAccountId: '', toAccountId: '', amount: '', date: today(), reference: '', notes: '' }); const [error, setError] = useState(''); const submit = async (event: FormEvent) => { event.preventDefault(); try { await treasuryService.transfer({ ...value, amount: Number(value.amount) }); onSaved(); } catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido transferir.'); } }; return <div className="mini-modal"><form onSubmit={submit}><h3>Transferir entre cuentas</h3><p className="large-note">La transferencia mueve dinero entre cuentas propias y no cambia el saldo total por moneda.</p><div className="form-grid"><label>Cuenta origen *<select value={value.fromAccountId} onChange={(e) => setValue({ ...value, fromAccountId: e.target.value })} required><option value="">Selecciona cuenta</option>{accounts.filter((a) => a.active).map((a) => <option key={a.treasury_account_id} value={a.treasury_account_id}>{a.name} · {a.currency_code}</option>)}</select></label><label>Cuenta destino *<select value={value.toAccountId} onChange={(e) => setValue({ ...value, toAccountId: e.target.value })} required><option value="">Selecciona cuenta</option>{accounts.filter((a) => a.active).map((a) => <option key={a.treasury_account_id} value={a.treasury_account_id}>{a.name} · {a.currency_code}</option>)}</select></label><label>Importe<input type="number" min="0.01" step="0.01" value={value.amount} onChange={(e) => setValue({ ...value, amount: e.target.value })} required /></label><label>Fecha<input type="date" value={value.date} onChange={(e) => setValue({ ...value, date: e.target.value })} required /></label></div><label>Referencia<input value={value.reference} onChange={(e) => setValue({ ...value, reference: e.target.value })} /></label><label>Notas<textarea value={value.notes} onChange={(e) => setValue({ ...value, notes: e.target.value })} /></label>{error && <p className="form-error">{error}</p>}<div className="modal-footer"><button type="button" onClick={onClose}>Cancelar</button><button className="primary">Transferir</button></div></form></div>; }

export function TreasuryModule({ profile }: { profile: Profile | null }) { return <><HistoricalTreasuryBackfillPanel profile={profile} /><TreasuryModuleContent profile={profile} /></>; }
