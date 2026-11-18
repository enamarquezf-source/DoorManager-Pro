import { expect, it } from 'vitest';
import { invoiceDocument, quoteDocument, workDocument } from './businessDocument';
import { createBusinessDocumentPdf } from './businessDocumentPdf';

it('keeps costs, margin, internal notes and signer identity documents out of customer work reports', () => {
  const work = workDocument({code:'PAR-1',title:'Puerta',work_performed:'Ajuste realizado',sat_review_reason:'SECRETO SAT',
    materials:[{description:'Motor',quantity:1,cost:12345,sale_amount:23456}],
    signatures:[{signer_name:'Cliente',signer_document:'SECRETO DNI',signed_at:'2026-11-18'}],
    time_entries:[{duration_minutes:90,internal_cost:34567}],
    cost_entries:[{description:'Viaje',quantity:20,unit:'km',cost_amount:45678}]});
  const data=JSON.stringify(work);
  for(const secret of ['SECRETO','12345','23456','34567','45678'])expect(data).not.toContain(secret);
  expect(data).toContain('Ajuste realizado');expect(data).toContain('1 h 30 min');
});
it('exports a client quote without costs and includes them only in the explicit internal variant', () => {
  const quote={code:'PRE-1',quote_lines:[{description:'Servicio',quantity:1,unit_price:90,unit_cost:61,total_price:90}],subtotal_cost:61,estimated_margin:29};
  expect(JSON.stringify(quoteDocument(quote))).not.toContain('61,00');
  expect(JSON.stringify(quoteDocument(quote,undefined,true))).toContain('61,00');
});
it('uses the immutable fiscal snapshot even when current invoice data differs', () => {
  const doc=invoiceDocument({code:'FAC-1',total_amount:999,clients:{legal_name:'Nuevo nombre'},fiscal_snapshot:{client:{legal_name:'Nombre original'},totals:{total_amount:121,subtotal:100,tax_amount:21},lines:[{description:'Original',quantity:1,unit_price:100,subtotal:100,tax_rate:21}]}});
  expect(doc.customer[0]).toBe('Nombre original');expect(doc.totals?.at(-1)?.value).toBe('121,00 €');
  expect(JSON.stringify(doc)).not.toContain('999');
});
it('paginates long descriptions and repeated table rows without omitting the final totals', async () => {
  const doc=quoteDocument({code:'PRE-LARGO',title:'Revisión',quote_lines:Array.from({length:65},(_,i)=>({description:`Equipo ${i+1}. ${'Comprobación de seguridad y funcionamiento. '.repeat(i===0?160:3)}`,quantity:1,unit_price:10,total_price:10,tax_rate:21})),taxable_base:650,tax_amount:136.5,total_amount:786.5});
  const pdf=await createBusinessDocumentPdf(doc);
  expect(pdf.getNumberOfPages()).toBeGreaterThan(3);
  const raw=pdf.output();expect(raw.startsWith('%PDF')).toBe(true);
  expect(raw.length).toBeGreaterThan(5000);
});
