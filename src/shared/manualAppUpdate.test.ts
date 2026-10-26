// @vitest-environment happy-dom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {requestManualAppUpdate} from './manualAppUpdate';
const pending=vi.hoisted(()=>vi.fn());
vi.mock('../services/technicianOfflineService',()=>({technicianOfflineService:{pending}}));
beforeEach(()=>{Object.defineProperty(window,'confirm',{value:vi.fn(()=>false),configurable:true,writable:true});});
afterEach(()=>{document.body.innerHTML='';sessionStorage.clear();vi.restoreAllMocks();pending.mockReset();});
it('does not navigate or clear local state if a technician cancels with unsent changes',async()=>{
 pending.mockResolvedValue([{}]);const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 sessionStorage.setItem('draft','keep');
 expect(await requestManualAppUpdate('tecnico','new')).toBe(false);
 expect(confirm).toHaveBeenCalledOnce();expect(sessionStorage.getItem('draft')).toBe('keep');expect(sessionStorage.getItem('dmp-last-manual-update')).toBeNull();
});
it('also protects forms in the office workspace before opening the updater',async()=>{
 document.body.innerHTML='<form><input value="Datos sin guardar"/></form>';vi.spyOn(window,'confirm').mockReturnValue(false);
 expect(await requestManualAppUpdate('oficina','new')).toBe(false);expect(pending).not.toHaveBeenCalled();
});

