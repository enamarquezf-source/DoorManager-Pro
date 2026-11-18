import { useState } from 'react';
import { Download } from 'lucide-react';
import type { BusinessDocument } from '../shared/businessDocument';

export function BusinessDocumentDownload({ label, prepare }: { label: string; prepare: () => BusinessDocument | Promise<BusinessDocument> }) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function download(){
    if(busy)return;
    setBusy(true);setError('');
    try{
      const doc=await prepare();
      const {createBusinessDocumentPdf}=await import('../shared/businessDocumentPdf');
      const pdf=await createBusinessDocumentPdf(doc);
      pdf.save(`${doc.kind}-${doc.code}.pdf`.replace(/[<>:"/\\|?*]/g,'-'));
    }catch{setError('No se ha podido preparar el PDF. Comprueba la conexión y vuelve a intentarlo.');}
    finally{setBusy(false);}
  }
  return <span className="document-download"><button type="button" onClick={()=>void download()} disabled={busy}><Download size={16} aria-hidden="true"/>{busy?'Preparando PDF…':label}</button>{error&&<span className="form-error" role="alert">{error}</span>}</span>;
}
