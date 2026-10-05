import { supabase } from '../lib/supabase/client';
import { currentCompanyId, expectData } from './query';
import { withSignedFileUrl } from '../shared/signedFiles';
import { storageUploadAlreadyExists } from '../shared/storageUploadConflict';
import { invoiceDocumentExtension, invoiceDocumentsBucket, type InvoiceDocumentOrigin } from '../shared/invoiceDocumentFiles';

export const supplierInvoiceDocumentsService = {
  async list(invoiceId: string) {
    const rows = await expectData<any[]>(supabase.from('documents')
      .select('*,files!documents_file_id_fkey(*),document_links!document_links_document_id_fkey!inner(*)')
      .eq('document_links.related_type', 'Factura proveedor').eq('document_links.related_id', invoiceId)
      .is('deleted_at', null).order('created_at', { ascending: false }), 'Cargar documentos de factura');
    return Promise.all(rows.map(async (row) => row.file_id ? withSignedFileUrl(row) : row));
  },
  async upload(invoiceId: string, origin: InvoiceDocumentOrigin, file: File, operationId: string) {
    const extension = invoiceDocumentExtension(file);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId)) throw new Error('Identificador del adjunto no válido. Vuelve a seleccionar el archivo.');
    const companyId = await currentCompanyId();
    const path = `${companyId}/${invoiceId}/${origin}/${operationId}.${extension}`;
    const { error } = await supabase.storage.from(invoiceDocumentsBucket).upload(path, file, { contentType: file.type, upsert: false });
    // A retry can find its own object already uploaded. Never overwrite it;
    // the registration RPC validates ownership and recovers the existing document.
    if (error && !storageUploadAlreadyExists(error)) throw new Error('No se ha podido subir el archivo. Comprueba la conexión y los permisos de documentos.');
    // Keep a successfully uploaded object on an uncertain RPC/network result so a committed
    // document is never left pointing to a deleted file. The RPC creates metadata atomically.
    return expectData<string>(supabase.rpc('dmp_register_supplier_invoice_document', {
      p_invoice_id: invoiceId, p_origin: origin, p_path: path, p_name: file.name,
    }), 'Adjuntar documento de factura');
  },
};
