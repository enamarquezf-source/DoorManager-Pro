import {it,expect,vi} from 'vitest';
import {publishedShellCache,verifyActiveShell} from '../../public/update-shell.js';

it('reads the published worker directly instead of the cached application version manifest',async()=>{
 const fetcher=vi.fn(async()=>({ok:true,text:async()=> 'const CACHE = "dmp-shell-new";'}));
 await expect(publishedShellCache(fetcher)).resolves.toBe('dmp-shell-new');
 expect(fetcher).toHaveBeenCalledWith(expect.stringMatching(/^\/sw.js\?check=/),{cache:'no-store'});
 await expect(publishedShellCache(async()=>({ok:false}))).rejects.toThrow('comprobar');
});
function channel(){return{port1:{onmessage:null as any,close:vi.fn()},port2:{close:vi.fn()}};}
it('confirms the active shell and rejects an old installed worker instead of silently returning to it',async()=>{
 const current=channel();
 await expect(verifyActiveShell({active:{postMessage:()=>current.port1.onmessage({data:{cache:'new'}})}},'new',()=>current)).resolves.toBeUndefined();
 expect(current.port1.close).toHaveBeenCalledOnce();
 const old=channel();
 await expect(verifyActiveShell({active:{postMessage:()=>old.port1.onmessage({data:{cache:'old'}})}},'new',()=>old)).rejects.toThrow('versión anterior');
});
it('reports an unconfirmed activation when an older worker does not support verification',async()=>{
 vi.useFakeTimers();
 try{
 const pending=verifyActiveShell({active:{postMessage:()=>{}}},'new',channel);
 const assertion=expect(pending).rejects.toThrow('no se ha confirmado');
 await vi.advanceTimersByTimeAsync(4000);await assertion;
 }finally{vi.useRealTimers();}
});
