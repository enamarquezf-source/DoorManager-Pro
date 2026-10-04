export const documentTypes = ['Manual de instalacion','Manual de mantenimiento','Manual de motor','Manual de cuadro','Esquema electrico','Despiece','Declaracion CE','Instrucciones de desbloqueo','Procedimiento interno','Ficha tecnica','Factura proveedor','Seguro','ITV','Formacion PRL','Certificado PRL','Otro documento'];
export function documentUrl(row: any): string | null {
 const value = row.signed_url || row.url;
 if (!value) return null;
 try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export function expiryState(value?: string | null, today = new Date().toLocaleDateString('sv-SE')) {
 if (!value) return 'Sin caducidad';
 if (value < today) return 'Caducado';
 const days = (Date.parse(value + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86400000;
 return days <= 30 ? 'Próximo a vencer' : 'Vigente';
}
