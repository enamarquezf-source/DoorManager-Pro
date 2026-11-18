import { expect, it } from 'vitest';
import { operationalProfileRoute } from './operationalProfileRoute';
it('does not link a SAT responsible back to the same work as a supposed profile',()=>{
 expect(operationalProfileRoute({primary_area:'SAT'},'sara')).toBeNull();
 expect(operationalProfileRoute({primary_area:'Tecnico'},'alex')).toBe('/app/modulos/tecnicos/alex');
 expect(operationalProfileRoute({profile_roles:[{roles:{name:'Comercial'}}]},'carlos')).toBe('/app/modulos/comerciales/carlos');
});
