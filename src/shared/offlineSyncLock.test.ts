// @vitest-environment happy-dom
import {expect,it,vi,afterEach} from 'vitest';
import {withOfflineSyncLock} from './offlineSyncLock';
afterEach(()=>vi.unstubAllGlobals());
it('queues explicit completion behind an existing sync rather than reporting a false failure',async()=>{
 const task=vi.fn(async()=> 'sent');const busy=vi.fn(async()=> 'busy');let release:()=>void=()=>{};
 const held=new Promise<void>(resolve=>release=resolve);
 const request=vi.fn(async(_name:string,options:any,callback:any)=>{if(options.ifAvailable)return callback(null);await held;return callback({name:'sync'});});
 vi.stubGlobal('navigator',{locks:{request}});
 const result=withOfflineSyncLock(task,busy,true);expect(task).not.toHaveBeenCalled();expect(busy).not.toHaveBeenCalled();release();expect(await result).toBe('sent');expect(task).toHaveBeenCalledOnce();
});
