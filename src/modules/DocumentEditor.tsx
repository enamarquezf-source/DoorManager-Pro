import { useModalScrollLock } from '../shared/useModalScrollLock';
import { useRef, useState, type FormEvent } from 'react';
import { ModalShell, FormSection } from '../components/FormPrimitives';
import { documentsService } from '../services/documentsService';
import { currentCompanyId } from '../services/query';
import { invoiceDocumentExtension } from '../shared/invoiceDocumentFiles';
import { documentTypes } from '../shared/documentPresentation';
export function DocumentEditor({ initial = {}, relatedType, relatedId, onClose, onSaved }: { initial?: any; relatedType?: string; relatedId?: string; onClose: () => void; onSaved: (id: string) => void | Promise<void> }) {
 useModalScrollLock();
 const [values,setValues]=useState<Record<string,any>>({ type:'Ficha tecnica', category:relatedType==='Vehiculo'?'Vehiculos':relatedType==='Registro PRL'?'PRL':'Tecnica', ...initial });
 const [file,setFile]=useState<File|null>(null); const [error,setError]=useState(''); const [saving,setSaving]=useState(false);
 const submitting=useRef(false); const path=useRef<string|undefined>(undefined);
 const set=(key:string,value:string)=>setValues(v=>({...v,[key]:value}));
 const submit=async(event:FormEvent)=>{event.preventDefault();if(submitting.current)return;
  if(!file&&!values.file_id&&!values.url?.trim()){setError('Selecciona un archivo o indica una URL.');return;}
  const dates=new FormData(event.currentTarget as HTMLFormElement);
  submitting.current=true;setSaving(true);setError('');
  try { if(file&&!path.current) path.current=(await currentCompanyId())+'/documents/'+crypto.randomUUID()+'.'+invoiceDocumentExtension(file);
   const id=await documentsService.save({ id:values.id,title:values.title,type:values.type,category:values.category,version:values.version,
    document_date:dates.get('document_date'),expires_on:dates.get('expires_on'),origin:values.origin,url:values.url,observations:values.observations,
    related_type:relatedType,related_id:relatedId },file,path.current);setValues(current=>({...current,id}));await onSaved(id);
  }catch(err){setError(err instanceof Error?err.message:'No se ha podido guardar el documento.');}finally{submitting.current=false;setSaving(false);}
 };
 return <ModalShell title={values.id?'Editar documento':'Añadir documento'} onClose={onClose} canClose={!saving}><form onSubmit={submit}><fieldset disabled={saving} style={{border:0,padding:0,margin:0,minWidth:0}}><FormSection><label>Título *<input value={values.title??''} onChange={e=>set('title',e.target.value)} required /></label><div className="form-grid"><label>Tipo<select value={values.type} onChange={e=>set('type',e.target.value)}>{documentTypes.map(t=><option key={t}>{t}</option>)}</select></label><label>Área<select value={values.category} disabled={Boolean(relatedType)} onChange={e=>set('category',e.target.value)}>{['Tecnica','General','Vehiculos','PRL'].map(t=><option key={t} value={t}>{t==='Tecnica'?'Técnica':t==='Vehiculos'?'Vehículos':t}</option>)}</select></label><label>Fecha del documento<input type="date" name="document_date" value={values.document_date??''} onChange={e=>set('document_date',e.target.value)} /></label><label>Caducidad opcional<input type="date" name="expires_on" value={values.expires_on??''} onChange={e=>set('expires_on',e.target.value)} /></label><label>Versión<input value={values.version??''} onChange={e=>set('version',e.target.value)} /></label><label>Origen<input value={values.origin??''} onChange={e=>set('origin',e.target.value)} /></label></div><label>Archivo privado · PDF o imagen, hasta 10 MB<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={saving} onChange={e=>{setFile(e.target.files?.[0]??null);path.current=undefined;}} /></label>{values.file_id&&!file&&<p className="large-note">El documento conserva el archivo adjunto actual.</p>}<label>URL alternativa<input type="url" value={values.url??''} placeholder="https://..." onChange={e=>set('url',e.target.value)} /></label><label>Observaciones<textarea value={values.observations??''} onChange={e=>set('observations',e.target.value)} /></label></FormSection></fieldset>{error&&<p role="alert" className="form-error">{error}</p>}<div className="modal-footer"><button type="button" disabled={saving} onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving?'Guardando...':'Guardar documento'}</button></div></form></ModalShell>;
}
