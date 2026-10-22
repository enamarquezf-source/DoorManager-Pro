import { expect, it } from 'vitest';
import { demoProjectUrl, isDemoProject, demoRoles, demoTourSteps, parseDemoSession } from './model';
const session={id:'00000000-0000-4000-8000-000000000001',company_id:'00000000-0000-4000-8000-000000000002',profile_id:'00000000-0000-4000-8000-000000000003',role:'Tecnico',expires_at:new Date(Date.now()+60000).toISOString(),ended:false,cleanup_state:'pending',work_order_id:'00000000-0000-4000-8000-000000000004'};
it('enables the public flow only for the explicitly separate demo project',()=>{
  expect(isDemoProject(demoProjectUrl)).toBe(true);
  for(const url of [undefined,'https://production.supabase.co',`${demoProjectUrl}.evil.test`,`${demoProjectUrl}/extra`,`http://xlhzyhotzfflemjnqvqn.supabase.co`,`${demoProjectUrl}?project=demo`]) expect(isDemoProject(url)).toBe(false);
  expect(demoRoles.map(role=>role.id)).not.toContain('superadmin');
});
it('rejects malformed session metadata rather than navigating to arbitrary records',()=>{
  for(const value of [null,{...session,role:'superadmin'},{...session,work_order_id:'../../other'},{...session,expires_at:'never'}])expect(()=>parseDemoSession(value)).toThrow();
});
it('guides the technician through the actual assigned work and both work phases',()=>{
  const steps=demoTourSteps(parseDemoSession(session));
  expect(steps[0].route).toBe('/app/tecnico');
  expect(steps.slice(1).every(step=>step.route.includes(session.work_order_id))).toBe(true);
  expect(steps.some(step=>step.route.endsWith('?vista=checks'))).toBe(true);
  expect(steps.some(step=>step.route.endsWith('?vista=records'))).toBe(true);
});
