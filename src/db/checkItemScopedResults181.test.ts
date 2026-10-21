import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll,afterEach,beforeAll,beforeEach,expect,it } from 'vitest';
const migration=readFileSync(new URL('../../supabase/migrations/181_check_item_scoped_results.sql',import.meta.url),'utf8');
const company='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const template='33333333-3333-4333-8333-333333333333',section='44444444-4444-4444-8444-444444444444',check='55555555-5555-4555-8555-555555555555';
const one='66666666-6666-4666-8666-666666666666',two='77777777-7777-4777-8777-777777777777',three='88888888-8888-4888-8888-888888888888';
let db:PGlite;
const payload=(extra:Record<string,any>={})=>({check_id:check,section_id:section,result:'Problema leve',severity:'Leve',remaining_favorable:true,item_results_version:1,selected_item_ids:[one],items:[{id:one,result:'Problema leve',observations:'Motor con ruido'},{id:two,result:'Todo favorable',observations:null},{id:three,result:'Todo favorable',observations:null}],...extra});
const save=(value=payload())=>db.query('select save_check_block_result($1::jsonb)',[JSON.stringify(value)]);
beforeAll(async()=>{
 db=new PGlite();await db.exec(`
 create role authenticated;create role anon;
 create table check_templates(id uuid primary key,company_id uuid);
 create table check_template_sections(id uuid primary key,template_id uuid references check_templates(id));
 create table check_template_items(id uuid primary key,section_id uuid references check_template_sections(id),title text,component text,position integer);
 create table checks(id uuid primary key,company_id uuid,template_id uuid,technician_id uuid,work_order_id uuid,deleted_at timestamptz,finished_at timestamptz,started_at timestamptz,updated_at timestamptz,status text,global_result text,observations text);
 create table check_section_results(id uuid primary key default gen_random_uuid(),company_id uuid,check_id uuid references checks(id),section_id uuid references check_template_sections(id),result text,observations text,intervention text,severity text,components jsonb,local_change_id text,synced_at timestamptz,updated_at timestamptz,unique(check_id,section_id));
 create table check_item_results(id uuid primary key default gen_random_uuid(),company_id uuid,check_id uuid references checks(id),section_result_id uuid references check_section_results(id),item_id uuid references check_template_items(id),result text,observations text,updated_at timestamptz,unique(check_id,item_id));
 create function current_profile_id() returns uuid language sql as $$select '${company}'::uuid$$;
 create function assert_member_of_current_company(uuid) returns void language plpgsql as $$begin if $1<>current_setting('test.company')::uuid then raise exception 'Otra empresa';end if;end$$;
 create function has_any_role(text[]) returns boolean language sql as $$select current_setting('test.role')='SAT'$$;
 create function is_assigned_to_work_order(uuid) returns boolean language sql as $$select false$$;
 insert into check_templates values('${template}','${company}');insert into check_template_sections values('${section}','${template}');
 insert into check_template_items values('${one}','${section}','Motor','Motor',1),('${two}','${section}','Banda','Seguridad',2),('${three}','${section}','Fotocélulas','Seguridad',3);
 insert into checks(id,company_id,template_id,status,global_result) values('${check}','${company}','${template}','Por realizar','Sin revisar');
 `);await db.exec(migration);await db.exec(migration);
},30000);
beforeEach(async()=>{await db.exec(`begin;select set_config('test.company','${company}',false);select set_config('test.role','SAT',false);`);});
afterEach(async()=>{await db.exec('rollback');});afterAll(async()=>{await db.close();});
it('persists one defective element and favorable unaffected elements, not the section status everywhere',async()=>{
 await save();const rows=await db.query<{item_id:string;result:string;observations:string|null}>('select item_id,result,observations from check_item_results order by item_id');expect(rows.rows).toEqual([{item_id:one,result:'Problema leve',observations:'Motor con ruido'},{item_id:two,result:'Todo favorable',observations:null},{item_id:three,result:'Todo favorable',observations:null}]);
 await save();expect((await db.query('select * from check_item_results')).rows).toHaveLength(3);
});
it('does not mark the rest as reviewed without confirmation',async()=>{
 await save(payload({remaining_favorable:false,items:[{id:one,result:'Problema leve',observations:'Ruido'},{id:two,result:'Sin revisar'},{id:three,result:'Sin revisar'}]}));expect((await db.query("select * from check_item_results where result='Sin revisar'")).rows).toHaveLength(2);
});
it('clears previous defects when the affected selection changes',async()=>{
 await save();await save(payload({selected_item_ids:[two],items:[{id:one,result:'Todo favorable'},{id:two,result:'Problema leve',observations:'Banda dañada'},{id:three,result:'Todo favorable'}]}));expect((await db.query<{result:string;observations:string|null}>('select result,observations from check_item_results where item_id=$1',[one])).rows[0]).toEqual({result:'Todo favorable',observations:null});
});
it('rejects unrelated item ids before writing anything',async()=>{
 const bad=payload();bad.items[1].id=other;await expect(save(bad)).rejects.toThrow(/otra sección/);
});
it('rejects a problem without a selected element',async()=>{await expect(save(payload({selected_item_ids:[]}))).rejects.toThrow(/Selecciona/);});
it('supports an older unambiguous offline selection without spreading the defect',async()=>{
 await save({check_id:check,section_id:section,result:'No favorable',observations:'Motor bloqueado',components:['Motor'],items:[]});const rows=await db.query<{result:string}>('select result from check_item_results order by item_id');expect(rows.rows.map(row=>row.result)).toEqual(['No favorable','Sin revisar','Sin revisar']);
});
it('does not interpret an ambiguous old component label as all matching elements',async()=>{await expect(save({check_id:check,section_id:section,result:'No favorable',observations:'Defecto',components:['Seguridad']})).rejects.toThrow(/ambigua/);});
it('denies an unassigned technician even when the check has no technician',async()=>{await db.exec("select set_config('test.role','Tecnico',false)");await expect(save()).rejects.toThrow(/permisos/);});
it('denies another company',async()=>{await db.exec(`select set_config('test.company','${other}',false)`);await expect(save()).rejects.toThrow('Otra empresa');});
