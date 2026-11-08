import { expect, it } from 'vitest';
import { filterCommercialOpportunities } from './commercialFilters';
it('opens only open or unassigned opportunities from dashboard indicators',()=>{
 const rows=[{id:'open',status:'Abierta',responsible_profile_id:'p'},{id:'unassigned',status:'Abierta'},{id:'closed',status:'Ganada',responsible_profile_id:'p'}];
 expect(filterCommercialOpportunities(rows,'abiertas',null).map(row=>row.id)).toEqual(['open','unassigned']);
 expect(filterCommercialOpportunities(rows,'','sin-responsable').map(row=>row.id)).toEqual(['unassigned']);
});
