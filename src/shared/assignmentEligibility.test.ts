import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';
import { canAssignTechnicalWorkOrder } from './assignmentEligibility';
describe('technical assignment eligibility',()=>{
 it.each(['Pendiente','Trabajo descargado','En desplazamiento','En intervencion','Pausado','Pendiente de material','Devuelto por SAT'])('allows %s',status=>expect(canAssignTechnicalWorkOrder({status})).toBe(true));
 it.each(['Finalizado tecnicamente','Pendiente de envio','Enviado','Cerrado','Cancelado','Devolucion solicitada',''])('blocks %s',status=>expect(canAssignTechnicalWorkOrder({status})).toBe(false));
 it('blocks archived and missing records',()=>{expect(canAssignTechnicalWorkOrder({status:'Pendiente',deleted_at:'2026-10-04'})).toBe(false);expect(canAssignTechnicalWorkOrder(null)).toBe(false);});
 it('parses the database guard and preserves historical assignments',async()=>{const sql=readFileSync(new URL('../../supabase/migrations/161_prevent_inactive_technical_assignments.sql',import.meta.url),'utf8');const parser=await pgQuery();expect(parser.parse(sql).error).toBeNull();expect(parser.parsePlpgsql(sql).error).toBeNull();expect(sql).toContain("new.status in ('Finalizado','Cancelado')");expect(sql).toContain('for update');expect(sql).not.toContain('delete from');});
});
