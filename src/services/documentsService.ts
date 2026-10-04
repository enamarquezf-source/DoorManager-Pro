import { withSignedFileUrl } from '../shared/signedFiles';
import { invoiceDocumentExtension } from '../shared/invoiceDocumentFiles';
import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, expectData } from './query';

export const documentsService = {
 async save(payload: Record<string, any>, file?: File | null, uploadPath?: string) {
  const next = { ...payload };
  if (file) {
   const extension = invoiceDocumentExtension(file);
   const companyId = await currentCompanyId();
   const path = uploadPath || companyId + '/documents/' + crypto.randomUUID() + '.' + extension;
   const { error } = await supabase.storage.from('dmp-documents').upload(path, file, { contentType: file.type, upsert: false });
   if (error && String(error.statusCode) !== '409' && !/already exists/i.test(error.message)) throw new Error('No se ha podido subir el archivo. Revisa la conexión y los permisos.');
   next.path = path; next.filename = file.name;
  }
  return expectData<string>(supabase.rpc('dmp_save_document', { p_payload: next }));
 },
 async linked(type: string, id: string) {
  const rows = await expectData<any[]>(supabase.from('documents').select('*, files!documents_file_id_fkey(*), document_links!document_links_document_id_fkey!inner(*)')
   .eq('document_links.related_type', type).eq('document_links.related_id', id).is('deleted_at', null).order('created_at', { ascending: false }));
  return Promise.all(rows.map(row => row.file_id ? withSignedFileUrl(row) : row));
 },
  list(search = '') {
    let query = supabase.from('documents').select('*, document_links!document_links_document_id_fkey(*)').is('deleted_at', null).order('title');
    if (search) query = query.or(contains(['title', 'type', 'origin', 'observations'], search));
    return expectData<any[]>(query);
  },
  async get(id: string) {
    const row = await expectData<any>(supabase.from('documents').select('*, files!documents_file_id_fkey(*), document_links!document_links_document_id_fkey(*)').eq('id', id).is('deleted_at', null).maybeSingle());
    if (!row) throw new Error('No se ha encontrado el documento solicitado.');
    return row.file_id ? withSignedFileUrl(row) : row;
  },
  async create(payload: Record<string, any>) {
    const company_id = await currentCompanyId();
    return expectData<any>(supabase.from('documents').insert({ ...payload, company_id }).select().single());
  },
  update(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('documents').update(payload).eq('id', id).select().single());
  },
  async link(document_id: string, related_type: string, related_id?: string | null, related_value?: string | null) {
    const company_id = await currentCompanyId();
    return expectData<any>(supabase.from('document_links').insert({ company_id, document_id, related_type, related_id: related_id || null, related_value: related_value || null }).select().single());
  },
};
