export const invoiceDocumentsBucket = 'dmp-invoice-documents';
export type InvoiceDocumentOrigin = 'Proveedor' | 'DMP';
const formats: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function invoiceDocumentExtension(file: Pick<File, 'type' | 'size'>) {
  if (!formats[file.type]) throw new Error('Selecciona un PDF o una imagen JPG, PNG o WebP.');
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error('El archivo debe contener datos y ocupar como máximo 10 MB.');
  return formats[file.type];
}
