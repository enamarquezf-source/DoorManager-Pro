import { expect, it } from 'vitest';
import { routeForAlert } from './alertRoutes';
import { canAccessRoute } from '../auth/permissions';
import type { Profile } from '../shared/types';
it('opens the technician work view instead of the forbidden office detail',()=>{
 const alert={related_entity:'work_orders',related_id:'work'};
 const technician={id:'p',company_id:'c',active:true,roles:['Tecnico'],primary_area:'Tecnico'} as Profile;
 expect(routeForAlert(alert,'tecnico')).toBe('/app/tecnico/trabajo/work');
 expect(canAccessRoute(technician,routeForAlert(alert,'tecnico'))).toBe(true);
 expect(canAccessRoute(technician,routeForAlert(alert))).toBe(false);
 expect(routeForAlert(alert,'sat')).toBe('/app/partes/work');
 expect(routeForAlert({related_entity:'checks',related_id:'check'},'tecnico')).toBe('/app/checks/check');
});
