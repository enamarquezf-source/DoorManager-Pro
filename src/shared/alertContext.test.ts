import { describe, expect, it } from 'vitest';
import { alertContextOptions, changeAlertContext } from './alertContext';
describe('alert context and recipients', () => {
  it('limits centers and equipment to the selected client and center', () => {
    const sites = [{id:'a',client_id:'one'},{id:'b',client_id:'two'}];
    const equipment = [{id:'x',client_id:'one',site_id:'a'},{id:'y',client_id:'two',site_id:'b'},{id:'z',client_id:'one',site_id:'c'}];
    expect(alertContextOptions(sites,equipment,'one','a')).toEqual({sites:[sites[0]],equipment:[equipment[0]]});
    expect(alertContextOptions(sites,equipment).equipment).toHaveLength(3);
  });
  it('clears old linked records and an individual recipient when choosing a group', () => {
    expect(changeAlertContext({site_id:'old',equipment_id:'old',check_id:'old'},'client_id','new')).toMatchObject({client_id:'new',site_id:'',equipment_id:'',check_id:''});
    expect(changeAlertContext({recipient_profile_id:'person'},'recipient_role','Todos')).toMatchObject({recipient_role:'Todos',recipient_profile_id:''});
    expect(changeAlertContext({recipient_role:'SAT'},'recipient_profile_id','person')).toMatchObject({recipient_role:'',recipient_profile_id:'person'});
  });
});
