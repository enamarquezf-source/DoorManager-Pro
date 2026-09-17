import { useEffect, useState, type FormEvent, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Profile } from '../shared/types';
import { hasPermission, isSuperadmin } from '../auth/permissions';
import { treasuryService, type TreasuryTransaction } from '../services/treasuryService';
import { HistoricalTreasuryBackfillPanel } from './HistoricalTreasuryBackfillPanel';

const money = (value: unknown, currency = 'EUR') => `${Number(value ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency === 'EUR' ? '€' : currency}`;
const date = (value: string | null | undefined) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-ES') : 'Sin fecha';
const today = () => new Date().toISOString().slice(0, 10);

type Account = { treasury_account_id: string; name: string; account_type: string; currency_code: string; opening_balance_date: string; balance: number; active: boolean };
type DisplayTransaction = TreasuryTransaction & { account_name: string; opening_balance_date: string; historical: boolean; counterpart_account_name?: string };

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
  const [selectedMovement, setSelectedMovement] = useState<DisplayTransaction | null>(null);

  const load = async (nextPage = page) => {
    try {
      setError('');
      const [nextAccounts, nextRows] = await Promise.all([treasuryService.accounts(), treasuryService.transactions(undefined, nextPage)]);
      const typedAccounts = nextAccounts as Account[];
      const accountById = new Map(typedAccounts.map((account) => [account.treasury_account_id, account]));
      setAccounts(typedAccounts);
      const transferAccounts = new Map<string, string>();
      nextRows.forEach((row) => { if (row.transfer_group_id) transferAccounts.set(`${row.transfer_group_id}:${row.treasury_account_id}`, accountById.get(row.treasury_account_id)?.name ?? 'Cuenta no informada'); });
      setRows(nextRows.map((row) => {
        const account = accountById.get(row.treasury_account_id);
        const counterpart = row.transfer_group_id ? nextRows.find((candidate) => candidate.transfer_group_id === row.transfer_group_id && candidate.treasury_account_id !== row.treasury_account_id) : null;
        return { ...row, account_name: account?.name ?? 'Cuenta no informada', opening_balance_date: account?.opening_balance_date ?? '', historical: !!account?.opening_balance_date && row.transaction_date < account.opening_balance_date, counterpart_account_name: counterpart ? transferAccounts.get(`${counterpart.transfer_group_id}:${counterpart.treasury_account_id}`) : undefined };
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
    <section className="card"><header><div><h3>Movimientos recientes</h3><p className="large-note">Más recientes primero. Los históricos siguen visibles y no alteran el Saldo DMP.</p></div></header>{rows.length ? <div className="record-list">{rows.map((row) => <TreasuryMovementCard key={row.id} row={row} profile={profile} onOpen={() => setSelectedMovement(row)} />)}</div> : <p className="large-note">No hay movimientos registrados.</p>}<div className="modal-footer"><button type="button" onClick={() => changePage(page - 1)} disabled={page === 0}>Anterior</button><span>Página {page + 1}</span><button type="button" onClick={() => changePage(page + 1)} disabled={!hasMore}>Siguiente</button></div></section>
    {accountForm && <AccountForm onClose={() => setAccountForm(false)} onSaved={refresh} />}{movementForm && <MovementForm accounts={accounts} onClose={() => setMovementForm(false)} onSaved={refresh} />}{transferForm && <TransferForm accounts={accounts} onClose={() => setTransferForm(false)} onSaved={refresh} />}{selectedMovement && <MovementDetail row={selectedMovement} profile={profile} onClose={() => setSelectedMovement(null)} />}
  </section>;
}

const methodLabel = (value?: string | null) => ({ transferencia: 'Transferencia', efectivo: 'Efectivo', tarjeta: 'Tarjeta', domiciliacion: 'Domiciliación', otro: 'Otro' } as Record<string, string>)[value ?? ''] ?? value ?? 'No informado';
const movementLabel = (row: DisplayTransaction) => row.source_type === 'customer_payment' ? 'Cobro de cliente' : row.source_type === 'supplier_payment' ? 'Pago a proveedor' : row.source_type === 'transfer' ? 'Transferencia entre cuentas' : 'Movimiento manual';
const baseRoute = (profile: Profile | null) => isSuperadmin(profile) ? '/app/superadmin' : '/app';

function TreasuryMovementCard({ row, profile, onOpen }: { row: DisplayTransaction; profile: Profile | null; onOpen: () => void }) {
  const customerPayment = row.customer_payment;
  const supplierPayment = row.supplier_payment;
  const invoice = customerPayment?.invoices;
  const supplierInvoice = supplierPayment?.supplier_invoices;
  const canViewBilling = hasPermission(profile, 'billing.read');
  const canViewSupplierInvoice = hasPermission(profile, 'supplier_invoices.read');
  const signedAmount = `${row.direction === 'inflow' ? '+' : '-'}${money(row.amount, row.currency_code)}`;
  const stop = (event: MouseEvent) => event.stopPropagation();
  return <article className="treasury-movement-card" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(); } }}>
    <div className="treasury-movement-main"><div className="treasury-movement-heading"><strong>{movementLabel(row)}</strong><strong className={row.direction === 'inflow' ? 'treasury-inflow' : 'treasury-outflow'}>{signedAmount}</strong></div><p>{date(row.transaction_date)} · {row.account_name}{row.counterpart_account_name ? ` → ${row.counterpart_account_name}` : ''}</p>
      {row.source_type === 'customer_payment' && <p>{invoice?.code ? `Factura ${invoice.code}` : 'Factura no disponible'} · Cliente: {invoice?.clients?.legal_name ?? 'No informado'}</p>}
      {row.source_type === 'supplier_payment' && <p>{supplierInvoice?.code ?? supplierInvoice?.supplier_invoice_number ?? 'Factura proveedor no disponible'} · Proveedor: {supplierInvoice?.suppliers?.name ?? 'No informado'}</p>}
      {row.source_type === 'manual' && <p>{row.concept ?? 'Sin concepto'}{row.notes ? ` · ${row.notes}` : ''}</p>}
      {row.source_type === 'transfer' && <p>{row.reference ?? 'Sin referencia'}</p>}
      <p>Método: {methodLabel(row.method ?? customerPayment?.method ?? supplierPayment?.payment_method)}{row.reference || customerPayment?.reference || supplierPayment?.reference ? ` · Referencia: ${row.reference ?? customerPayment?.reference ?? supplierPayment?.reference}` : ''}</p>
      <div className="treasury-movement-badges">{row.reversed_at && <span className="status-badge muted">Revertido</span>}{row.historical && <span className="status-badge muted" title={`No afecta al Saldo DMP porque es anterior al ${date(row.opening_balance_date)}`}>Histórico anterior al saldo inicial</span>}</div>
    </div><div className="row-actions" onClick={stop}>{row.source_type === 'customer_payment' && canViewBilling && <><Link to={`/app/modulos/cobros?invoice=${invoice?.id ?? customerPayment?.invoice_id}&payment=${customerPayment?.id}`}>Ver cobro</Link>{invoice?.id && <Link to={`/app/modulos/facturacion?invoice=${invoice.id}`}>Ver factura</Link>}{invoice?.clients?.id && <Link to={`${baseRoute(profile)}/clientes/${invoice.clients.id}`}>Ver cliente</Link>}</>}{row.source_type === 'supplier_payment' && canViewSupplierInvoice && <><Link to={`/app/modulos/facturas-proveedor?id=${supplierInvoice?.id ?? supplierPayment?.supplier_invoice_id}`}>Ver pago</Link>{supplierInvoice?.id && <Link to={`/app/modulos/facturas-proveedor?id=${supplierInvoice.id}`}>Ver factura proveedor</Link>}</>}</div>
  </article>;
}

function MovementDetail({ row, profile, onClose }: { row: DisplayTransaction; profile: Profile | null; onClose: () => void }) {
  const invoice = row.customer_payment?.invoices;
  const supplierInvoice = row.supplier_payment?.supplier_invoices;
  const canViewBilling = hasPermission(profile, 'billing.read');
  const canViewSupplierInvoice = hasPermission(profile, 'supplier_invoices.read');
  return <div className="mini-modal" role="dialog" aria-modal="true"><div className="card"><header><div><h3>{movementLabel(row)}</h3><p className="large-note">Detalle completo del movimiento registrado.</p></div><button type="button" onClick={onClose}>Cerrar</button></header><dl className="info-grid"><div><dt>Fecha</dt><dd>{date(row.transaction_date)}</dd></div><div><dt>Importe</dt><dd>{row.direction === 'inflow' ? '+' : '-'}{money(row.amount, row.currency_code)}</dd></div><div><dt>Cuenta</dt><dd>{row.account_name}</dd></div><div><dt>Método</dt><dd>{methodLabel(row.method ?? row.customer_payment?.method ?? row.supplier_payment?.payment_method)}</dd></div><div><dt>Referencia</dt><dd>{row.reference ?? row.customer_payment?.reference ?? row.supplier_payment?.reference ?? 'No informada'}</dd></div><div><dt>Notas</dt><dd>{row.notes ?? row.customer_payment?.notes ?? row.supplier_payment?.notes ?? 'Sin notas'}</dd></div><div><dt>Estado</dt><dd>{row.reversed_at ? 'Revertido' : 'Activo'}</dd></div>{row.historical && <div><dt>Saldo DMP</dt><dd>Histórico anterior al saldo inicial · no afecta al saldo actual</dd></div>}</dl>{invoice && <p>Factura: {invoice.code} · Cliente: {invoice.clients?.legal_name ?? 'No informado'}</p>}{supplierInvoice && <p>Factura proveedor: {supplierInvoice.code} · Proveedor: {supplierInvoice.suppliers?.name ?? 'No informado'}</p>}<div className="modal-footer">{row.source_type === 'customer_payment' && canViewBilling && <><Link to={`/app/modulos/cobros?invoice=${invoice?.id ?? row.customer_payment?.invoice_id}&payment=${row.customer_payment?.id}`}>Ver cobro</Link>{invoice?.id && <Link to={`/app/modulos/facturacion?invoice=${invoice.id}`}>Ver factura</Link>}</>}{row.source_type === 'supplier_payment' && canViewSupplierInvoice && <Link to={`/app/modulos/facturas-proveedor?id=${supplierInvoice?.id ?? row.supplier_payment?.supplier_invoice_id}`}>Ver factura proveedor</Link>}<button type="button" onClick={onClose}>Cerrar</button></div></div></div>;
}

function AccountForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) { const [value, setValue] = useState({ name: '', account_type: 'bank', iban: '', currency_code: 'EUR', opening_balance: '0', opening_balance_date: today(), notes: '' }); const [error, setError] = useState(''); const submit = async (event: FormEvent) => { event.preventDefault(); try { await treasuryService.createAccount({ ...value, opening_balance: Number(value.opening_balance) }); onSaved(); } catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido crear la cuenta.'); } }; return <div className="mini-modal"><form onSubmit={submit}><h3>Nueva cuenta de empresa</h3><div className="form-grid"><label>Nombre *<input value={value.name} onChange={(e) => setValue({ ...value, name: e.target.value })} required /></label><label>Tipo<select value={value.account_type} onChange={(e) => setValue({ ...value, account_type: e.target.value })}><option value="bank">Banco</option><option value="cash">Caja</option></select></label><label>IBAN<input value={value.iban} onChange={(e) => setValue({ ...value, iban: e.target.value })} /></label><label>Moneda<input value={value.currency_code} maxLength={3} onChange={(e) => setValue({ ...value, currency_code: e.target.value.toUpperCase() })} required /></label><label>Saldo inicial<input type="number" step="0.01" value={value.opening_balance} onChange={(e) => setValue({ ...value, opening_balance: e.target.value })} /></label><label>Fecha saldo inicial<input type="date" value={value.opening_balance_date} onChange={(e) => setValue({ ...value, opening_balance_date: e.target.value })} required /></label></div>{error && <p className="form-error">{error}</p>}<div className="modal-footer"><button type="button" onClick={onClose}>Cancelar</button><button className="primary">Crear cuenta</button></div></form></div>; }
function MovementForm({ accounts, onClose, onSaved }: { accounts: Account[]; onClose: () => void; onSaved: () => void }) { const [value, setValue] = useState({ accountId: '', direction: 'outflow' as 'inflow' | 'outflow', amount: '', date: today(), concept: '', reference: '' }); const [error, setError] = useState(''); const submit = async (event: FormEvent) => { event.preventDefault(); try { await treasuryService.manual({ ...value, amount: Number(value.amount) }); onSaved(); } catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido registrar el movimiento.'); } }; return <div className="mini-modal"><form onSubmit={submit}><h3>Nuevo movimiento manual</h3><div className="form-grid"><label>Cuenta *<select value={value.accountId} onChange={(e) => setValue({ ...value, accountId: e.target.value })} required><option value="">Selecciona cuenta</option>{accounts.filter((a) => a.active).map((a) => <option key={a.treasury_account_id} value={a.treasury_account_id}>{a.name} · {a.currency_code}</option>)}</select></label><label>Tipo<select value={value.direction} onChange={(e) => setValue({ ...value, direction: e.target.value as 'inflow' | 'outflow' })}><option value="inflow">Entrada</option><option value="outflow">Salida</option></select></label><label>Importe<input type="number" min="0.01" step="0.01" value={value.amount} onChange={(e) => setValue({ ...value, amount: e.target.value })} required /></label><label>Fecha<input type="date" value={value.date} onChange={(e) => setValue({ ...value, date: e.target.value })} required /></label></div><label>Concepto / motivo *<input value={value.concept} onChange={(e) => setValue({ ...value, concept: e.target.value })} required /></label><label>Referencia<input value={value.reference} onChange={(e) => setValue({ ...value, reference: e.target.value })} /></label>{error && <p className="form-error">{error}</p>}<div className="modal-footer"><button type="button" onClick={onClose}>Cancelar</button><button className="primary">Registrar</button></div></form></div>; }
function TransferForm({ accounts, onClose, onSaved }: { accounts: Account[]; onClose: () => void; onSaved: () => void }) { const [value, setValue] = useState({ fromAccountId: '', toAccountId: '', amount: '', date: today(), reference: '', notes: '' }); const [error, setError] = useState(''); const submit = async (event: FormEvent) => { event.preventDefault(); try { await treasuryService.transfer({ ...value, amount: Number(value.amount) }); onSaved(); } catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido transferir.'); } }; return <div className="mini-modal"><form onSubmit={submit}><h3>Transferir entre cuentas</h3><p className="large-note">La transferencia mueve dinero entre cuentas propias y no cambia el saldo total por moneda.</p><div className="form-grid"><label>Cuenta origen *<select value={value.fromAccountId} onChange={(e) => setValue({ ...value, fromAccountId: e.target.value })} required><option value="">Selecciona cuenta</option>{accounts.filter((a) => a.active).map((a) => <option key={a.treasury_account_id} value={a.treasury_account_id}>{a.name} · {a.currency_code}</option>)}</select></label><label>Cuenta destino *<select value={value.toAccountId} onChange={(e) => setValue({ ...value, toAccountId: e.target.value })} required><option value="">Selecciona cuenta</option>{accounts.filter((a) => a.active).map((a) => <option key={a.treasury_account_id} value={a.treasury_account_id}>{a.name} · {a.currency_code}</option>)}</select></label><label>Importe<input type="number" min="0.01" step="0.01" value={value.amount} onChange={(e) => setValue({ ...value, amount: e.target.value })} required /></label><label>Fecha<input type="date" value={value.date} onChange={(e) => setValue({ ...value, date: e.target.value })} required /></label></div><label>Referencia<input value={value.reference} onChange={(e) => setValue({ ...value, reference: e.target.value })} /></label><label>Notas<textarea value={value.notes} onChange={(e) => setValue({ ...value, notes: e.target.value })} /></label>{error && <p className="form-error">{error}</p>}<div className="modal-footer"><button type="button" onClick={onClose}>Cancelar</button><button className="primary">Transferir</button></div></form></div>; }

export function TreasuryModule({ profile }: { profile: Profile | null }) { return <><HistoricalTreasuryBackfillPanel profile={profile} /><TreasuryModuleContent profile={profile} /></>; }
