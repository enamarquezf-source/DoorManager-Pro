import { useEffect, useRef, useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Profile } from '../shared/types';
import { hasPermission } from '../auth/permissions';
import { supplierInvoiceDocumentsService } from '../services/supplierInvoiceDocumentsService';
import type { InvoiceDocumentOrigin } from '../shared/invoiceDocumentFiles';

function documentUrl(row: any) {
  const value = row.signed_url ?? row.url;
  if (!value) return null;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}

export function SupplierInvoiceDocumentsPanel({ invoiceId, profile }: { invoiceId: string; profile: Profile | null }) {
  const submitting = useRef(false);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<InvoiceDocumentOrigin | null>(null);
  const [selection, setSelection] = useState<{ origin: InvoiceDocumentOrigin; file: File; operationId: string } | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const canUpload = hasPermission(profile, 'documents.create') && hasPermission(profile, 'documents.read');
  const load = async () => {
    setLoading(true);
    try { setRows(await supplierInvoiceDocumentsService.list(invoiceId)); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se han podido cargar los documentos.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { setError(''); setSelection(null); void load(); }, [invoiceId]);
  const upload = async () => {
    if (!selection || submitting.current) return;
    submitting.current = true;
    setBusy(selection.origin); setError('');
    try { await supplierInvoiceDocumentsService.upload(invoiceId, selection.origin, selection.file, selection.operationId); setSelection(null); setInputKey((key) => key + 1); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido adjuntar el archivo.'); }
    finally { submitting.current = false; setBusy(null); }
  };
  return <section className="card invoice-documents-panel"><header><h3>Documentos</h3></header>
    <p className="invoice-document-hint">PDF o imagen · Hasta 10 MB por archivo</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading && <p role="status">Cargando documentos...</p>}
    {(['Proveedor', 'DMP'] as const).map((origin) => {
      const documents = rows.filter((row) => origin === 'DMP' ? row.origin === 'DMP' : row.origin !== 'DMP');
      return <div className="invoice-document-group" key={origin}><div className="invoice-document-heading"><FileText size={18} aria-hidden="true" /><div><strong>{origin === 'Proveedor' ? 'Factura del proveedor' : 'Documento generado por DMP'}</strong><p>{origin === 'Proveedor' ? 'Adjunta el archivo enviado por el proveedor.' : 'Adjunta la factura o documento que has generado en DMP.'}</p></div></div>
        {!loading && !documents.length && <p className="invoice-document-empty">Sin archivos adjuntos</p>}
        {documents.map((row) => { const url = documentUrl(row); return <div className="invoice-document-file" key={row.id}><span>{row.files?.name ?? row.title}</span>{url ? <a href={url} target="_blank" rel="noopener noreferrer">Abrir archivo ↗</a> : <span>Archivo no disponible</span>}</div>; })}
        {canUpload && <label className="invoice-document-picker"><Upload size={16} aria-hidden="true" /><span>Seleccionar archivo</span><input key={`${origin}-${inputKey}`} type="file" aria-label={`Adjuntar documento ${origin}`} accept="application/pdf,image/jpeg,image/png,image/webp" disabled={Boolean(busy)} onChange={(event) => { const file = event.target.files?.[0]; if (file) setSelection({ origin, file, operationId: crypto.randomUUID() }); }} /></label>}
        {selection?.origin === origin && <div className="invoice-document-confirm"><span>{selection.file.name}</span><button className="primary" type="button" disabled={Boolean(busy)} onClick={() => void upload()}>{busy ? 'Subiendo...' : 'Adjuntar archivo'}</button></div>}
      </div>;
    })}
    <Link to="/app/documentos">Ver documentación general</Link>
  </section>;
}
