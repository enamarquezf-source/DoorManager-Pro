import { FormEvent, useCallback, useEffect, useState } from 'react';
import { billingService } from '../services/billingService';

type Mode = 'invoices' | 'collections';
type Action = { kind: 'invoice' | 'payment' | 'cancel' | 'reverse'; row: any } | null;

function money(value: unknown) { return `${Number(value ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`; }
function date(value?: string | null) { return value ? new Date(value).toLocaleDateString('es-ES') : '-'; }
function errorText(error: unknown) { return error instanceof Error ? error.message : 'No se ha podido completar la operación.'; }

export function BillingModule({ mode }: { mode: Mode }) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [invoiceable, setInvoiceable] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [action, setAction] = useState<Action>(null);
  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const nextAvailable = await billingService.isAvailable();
      setAvailable(nextAvailable);
      if (!nextAvailable) { setInvoices([]); setInvoiceable([]); return; }
      const [nextInvoices, nextInvoiceable] = await Promise.all([billingService.invoices(), billingService.invoiceableWorkOrders()]); setInvoices(nextInvoices); setInvoiceable(nextInvoiceable);
    }
    catch (err) { setError(errorText(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const visible = mode === 'collections' ? invoices.filter((row) => row.status !== 'cancelada' && Number(row.paid_amount) < Number(row.total_amount)) : invoices;
  const issued = invoices.filter((row) => row.status !== 'cancelada').reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
  const collected = invoices.filter((row) => row.status !== 'cancelada').reduce((sum, row) => sum + Number(row.paid_amount ?? 0), 0);
  if (available === false) return <section className="page billing-page"><div className="page-head"><div><p className="eyebrow">Oficina</p><h2>{mode === 'invoices' ? 'Facturación' : 'Cobros'}</h2></div><button onClick={reload} disabled={loading}>Actualizar</button></div><div className="card"><h3>Facturación pendiente de activación</h3><p className="large-note">Este módulo estará disponible cuando se active el backend de facturación y validación de oficina.</p></div></section>;
  return <section className="page billing-page">
    <div className="page-head"><div><p className="eyebrow">Oficina</p><h2>{mode === 'invoices' ? 'Facturación' : 'Cobros'}</h2><p>{mode === 'invoices' ? 'Emisión trazable desde partes validados.' : 'Registro y conciliación de cobros de cliente.'}</p></div><button onClick={reload} disabled={loading}>Actualizar</button></div>
    <div className="stats-grid"><div className="metric info"><span>Emitido con IVA</span><strong>{money(issued)}</strong></div><div className="metric ok"><span>Cobrado</span><strong>{money(collected)}</strong></div><div className="metric warn"><span>Pendiente</span><strong>{money(issued - collected)}</strong></div><div className="metric commercial"><span>Partes listos</span><strong>{invoiceable.length}</strong></div></div>
    {error && <p className="form-error">{error}</p>}
    {loading && <p className="large-note">Cargando información económica…</p>}
    {mode === 'invoices' && <section className="card"><h3>Partes validados pendientes de factura</h3><div className="compact-list">{invoiceable.map((work) => <article key={work.id}><div><strong>{work.code} · {work.title}</strong><p>{work.clients?.legal_name ?? 'Cliente'} · Venta sin IVA {money(work.sale_amount)}</p></div><button className="primary" onClick={() => setAction({ kind: 'invoice', row: work })}>Emitir factura</button></article>)}</div>{!invoiceable.length && !loading && <p className="large-note">No hay partes validados pendientes de factura.</p>}</section>}
    <section className="card"><h3>{mode === 'invoices' ? 'Facturas emitidas' : 'Facturas pendientes de cobro'}</h3><div className="table-card"><table><thead><tr><th>Factura</th><th>Cliente</th><th>Emisión</th><th>Vencimiento</th><th>Estado</th><th>Total</th><th>Cobrado</th><th>Saldo</th><th></th></tr></thead><tbody>{visible.map((invoice) => <tr key={invoice.id}><td>{invoice.code}</td><td>{invoice.clients?.legal_name ?? '-'}</td><td>{date(invoice.issue_date)}</td><td>{date(invoice.due_date)}</td><td>{invoice.status.replaceAll('_', ' ')}</td><td>{money(invoice.total_amount)}</td><td>{money(invoice.paid_amount)}</td><td>{money(Number(invoice.total_amount) - Number(invoice.paid_amount))}</td><td><div className="row-actions">{invoice.status !== 'cancelada' && Number(invoice.paid_amount) < Number(invoice.total_amount) && <button className="primary" onClick={() => setAction({ kind: 'payment', row: invoice })}>Registrar cobro</button>}{mode === 'invoices' && invoice.status !== 'cancelada' && <button className="danger" onClick={() => setAction({ kind: 'cancel', row: invoice })}>Cancelar factura</button>}</div></td></tr>)}</tbody></table></div>{!visible.length && !loading && <p className="large-note">Sin registros.</p>}</section>
    {invoices.some((invoice) => (invoice.invoice_payments ?? []).length) && <section className="card"><h3>Movimientos de cobro</h3><div className="compact-list">{invoices.flatMap((invoice) => (invoice.invoice_payments ?? []).map((payment: any) => ({ invoice, payment }))).map(({ invoice, payment }) => <article key={payment.id}><div><strong>{invoice.code} · {money(payment.amount)}</strong><p>{date(payment.paid_at)} · {payment.method} · {payment.reference ?? 'Sin referencia'}{payment.reversed_at ? ' · ANULADO' : ''}</p></div>{!payment.reversed_at && <button className="danger" onClick={() => setAction({ kind: 'reverse', row: payment })}>Anular cobro</button>}</article>)}</div></section>}
    {action?.kind === 'invoice' && <InvoiceModal work={action.row} onClose={() => setAction(null)} onSaved={() => { setAction(null); reload(); }} />}
    {action?.kind === 'payment' && <PaymentModal invoice={action.row} onClose={() => setAction(null)} onSaved={() => { setAction(null); reload(); }} />}
    {(action?.kind === 'cancel' || action?.kind === 'reverse') && <ReasonModal title={action.kind === 'cancel' ? 'Cancelar factura' : 'Anular cobro'} onClose={() => setAction(null)} onConfirm={async (reason) => { if (action.kind === 'cancel') await billingService.cancelInvoice(action.row.id, reason); else await billingService.reversePayment(action.row.id, reason); setAction(null); reload(); }} />}
  </section>;
}

function InvoiceModal({ work, onClose, onSaved }: { work: any; onClose: () => void; onSaved: () => void }) {
  const [tax, setTax] = useState('21'); const [due, setDue] = useState(''); const [notes, setNotes] = useState(''); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const submit = async (event: FormEvent) => { event.preventDefault(); if (Number(tax) < 0) return; setSaving(true); setError(''); try { await billingService.createInvoice(work.id, { tax_rate: Number(tax), due_date: due, notes }); onSaved(); } catch (err) { setError(errorText(err)); } finally { setSaving(false); } };
  return <div className="mini-modal" role="dialog" aria-modal="true"><form onSubmit={submit}><h3>Emitir factura · {work.code}</h3><p>Cliente: {work.clients?.legal_name ?? '-'} · Base: {money(work.sale_amount)}</p><div className="form-grid"><label>IVA %<input type="number" min="0" step="0.01" value={tax} onChange={(event) => setTax(event.target.value)} required /></label><label>Vencimiento<input type="date" value={due} onChange={(event) => setDue(event.target.value)} /></label></div><label>Notas<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>{error && <p className="form-error">{error}</p>}<div className="modal-footer"><button type="button" onClick={onClose} disabled={saving}>Cancelar</button><button className="primary" disabled={saving}>Emitir factura</button></div></form></div>;
}

function PaymentModal({ invoice, onClose, onSaved }: { invoice: any; onClose: () => void; onSaved: () => void }) {
  const balance = Math.max(Number(invoice.total_amount) - Number(invoice.paid_amount), 0); const [amount, setAmount] = useState(String(balance)); const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10)); const [method, setMethod] = useState('transferencia'); const [reference, setReference] = useState(''); const [notes, setNotes] = useState(''); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const submit = async (event: FormEvent) => { event.preventDefault(); if (Number(amount) <= 0 || Number(amount) > balance) { setError('El importe debe ser positivo y no superar el saldo.'); return; } setSaving(true); setError(''); try { await billingService.recordPayment(invoice.id, { amount: Number(amount), paid_at: paidAt, method, reference, notes }); onSaved(); } catch (err) { setError(errorText(err)); } finally { setSaving(false); } };
  return <div className="mini-modal" role="dialog" aria-modal="true"><form onSubmit={submit}><h3>Registrar cobro · {invoice.code}</h3><p>Saldo pendiente: {money(balance)}</p><div className="form-grid"><label>Importe<input type="number" min="0.01" max={balance} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label><label>Fecha<input type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} required /></label><label>Método<select value={method} onChange={(event) => setMethod(event.target.value)}><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option><option value="efectivo">Efectivo</option><option value="domiciliacion">Domiciliación</option><option value="otro">Otro</option></select></label></div><label>Referencia<input value={reference} onChange={(event) => setReference(event.target.value)} /></label><label>Notas<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>{error && <p className="form-error">{error}</p>}<div className="modal-footer"><button type="button" onClick={onClose} disabled={saving}>Cancelar</button><button className="primary" disabled={saving}>Registrar cobro</button></div></form></div>;
}

function ReasonModal({ title, onClose, onConfirm }: { title: string; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState(''); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!reason.trim()) { setError('El motivo es obligatorio.'); return; } setSaving(true); setError(''); try { await onConfirm(reason.trim()); } catch (err) { setError(errorText(err)); setSaving(false); } };
  return <div className="mini-modal" role="dialog" aria-modal="true"><form onSubmit={submit}><h3>{title}</h3><label>Motivo obligatorio<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>{error && <p className="form-error">{error}</p>}<div className="modal-footer"><button type="button" onClick={onClose} disabled={saving}>Cancelar</button><button className="danger" disabled={saving}>Confirmar</button></div></form></div>;
}
