import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect,it } from 'vitest';
import { hasPermission } from '../auth/rbac';
const sql=readFileSync('supabase/migrations/190_deficiency_deletion.sql','utf8');
it('allows managers only and honors explicit revocation',()=>{
 for(const role of ['SAT','Oficina','Gerencia','superadmin','Comercial','Tecnico'])expect(hasPermission({active:true,roles:[role]} as any,'deficiencies.delete')).toBe(!['Comercial','Tecnico'].includes(role));
 expect(hasPermission({active:true,roles:['SAT'],permission_grants:['-deficiencies.delete']} as any,'deficiencies.delete')).toBe(false);
});
it('soft deletes only authorized tenant records, audits once and preserves check evidence',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;
 create table profiles(id uuid,company_id uuid);
 create table roles(id int primary key,name text);create table permissions(id serial primary key,code text unique,description text);create table role_permissions(role_id int,permission_id int,unique(role_id,permission_id));
 create table deficiencies(id uuid primary key,company_id uuid,check_id uuid,deleted_at timestamptz,updated_at timestamptz);
 create table audit_log(company_id uuid,table_name text,record_id uuid,operation text,changed_by uuid,old_data jsonb,new_data jsonb);
 create function dmp024_active_profile() returns profiles language sql as $$select p from profiles p limit 1$$;
 create function has_any_role(text[]) returns boolean language sql as $$select current_setting('test.allowed')='yes'$$;
 create function has_permission(text) returns boolean language sql as $$select current_setting('test.allowed')='yes'$$;
 create function is_platform_superadmin() returns boolean language sql as $$select false$$;
 insert into profiles values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');
 insert into deficiencies values('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000099',null,null),('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000003',null,null,null);`);
 await db.exec(sql);
 await db.exec(`set test.allowed='no'`);
 await expect(db.query(`select dmp_delete_deficiency('00000000-0000-0000-0000-000000000010')`)).rejects.toThrow('permiso');
 await db.exec(`set test.allowed='yes'`);
 await expect(db.query(`select dmp_delete_deficiency('00000000-0000-0000-0000-000000000011')`)).rejects.toThrow('no disponible');
 await db.exec(`select dmp_delete_deficiency('00000000-0000-0000-0000-000000000010');select dmp_delete_deficiency('00000000-0000-0000-0000-000000000010');`);
 const {rows}=await db.query<any>(`select deleted_at,check_id from deficiencies where id='00000000-0000-0000-0000-000000000010'`);
 expect(rows[0].deleted_at).toBeTruthy();expect(rows[0].check_id).toBe('00000000-0000-0000-0000-000000000099');
 expect((await db.query('select * from audit_log')).rows).toHaveLength(1);
 }finally{await db.close();}
});
