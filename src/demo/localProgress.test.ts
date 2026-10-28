import{expect,it}from'vitest';import{withLocalProgress}from'./localProgress';
it('recognizes durable work drafts without requiring a separate send click, but never pretends the work reached SAT',()=>{const changes:any=[{type:'photo',workOrderId:'own',status:'pending',payload:{}},{type:'time',workOrderId:'own',status:'pending',payload:{}},{type:'work-fields',workOrderId:'own',status:'pending',payload:{work_performed:'Trabajo ficticio'}},{type:'signature',workOrderId:'own',status:'pending',payload:{}},{type:'work-finish',workOrderId:'own',status:'pending',payload:{}},{type:'photo',workOrderId:'other',status:'pending',payload:{}},{type:'photo',workOrderId:'own',status:'synced',payload:{}}];expect(withLocalProgress({photos:1,times:0,completed_work:0},changes,'own')).toMatchObject({photos:2,times:1,work_notes:1,signatures:1,completed_work:0,local_pending:5});});
it('waits for a submitted check closure instead of advancing after the first saved component',()=>{
 const block:any={type:'check-block',checkId:'check',workOrderId:'own',status:'pending',payload:{items:[{result:'Todo favorable'}]}};
 expect(withLocalProgress({checks:0},[block],'own').checks).toBe(0);
 const close:any={type:'check-finish',checkId:'check',workOrderId:'own',status:'pending',payload:{autoSync:true}};
 expect(withLocalProgress({checks:0},[block,close],'own').checks).toBe(1);
});
