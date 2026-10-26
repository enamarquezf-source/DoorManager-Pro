import {PGlite} from '@electric-sql/pglite';import{readFileSync}from'node:fs';import{expect,it}from'vitest';
it('seeds only active demo companies once and never replenishes visitor stock on reinstall',async()=>{
const db=new PGlite();try{await db.exec(`
create role anon;create role authenticated;
create table dmp_demo_sessions(company_id uuid,ended_at timestamptz,expires_at timestamptz,absolute_expires_at timestamptz,cleanup_state text);
create table dmp_demo_role_profiles(company_id uuid,role_name text,profile_id uuid);
create table warehouses(id uuid default gen_random_uuid(),company_id uuid,code text,deleted_at timestamptz);
create table suppliers(id uuid default gen_random_uuid(),company_id uuid,name text,internal_code text,trade_name text,city text,province text,country text,payment_method text,payment_terms_days integer,internal_notes text,deleted_at timestamptz,unique(company_id,internal_code));
create table materials(id uuid default gen_random_uuid(),company_id uuid,code text,description text,manufacturer text,reference text,unit text,cost numeric,price numeric,minimum_stock numeric,stock_controlled boolean,unique(company_id,code));
create table warehouse_stock(company_id uuid,warehouse_id uuid,material_id uuid,quantity numeric,unique(warehouse_id,material_id));
create table stock_movements(company_id uuid,warehouse_id uuid,material_id uuid,movement_type text,quantity numeric,created_by uuid,notes text,idempotency_key text,unique(company_id,idempotency_key));
create table material_suppliers(company_id uuid,material_id uuid,supplier_id uuid,supplier_reference text,purchase_unit_price numeric,is_preferred boolean,unique(company_id,material_id,supplier_id));
create function dmp_demo_prepare_resource_rates(uuid) returns void language sql as $$select$$;
create function dmp_demo_prepare_team(uuid) returns void language sql as $$select$$;
insert into dmp_demo_sessions values('11111111-1111-1111-1111-111111111111',null,now()+interval '1 hour',now()+interval '2 hours','pending');
insert into dmp_demo_role_profiles values('11111111-1111-1111-1111-111111111111','SAT','22222222-2222-2222-2222-222222222222');
insert into warehouses(company_id,code) values('11111111-1111-1111-1111-111111111111','ALM-DEMO');
`);const sql=readFileSync('supabase/demo/009_demo_inventory_examples.sql','utf8');await db.exec(sql);
expect((await db.query('select * from materials')).rows).toHaveLength(3);expect((await db.query('select * from suppliers')).rows).toHaveLength(1);
expect((await db.query('select * from stock_movements')).rows).toHaveLength(2);
await db.exec('update warehouse_stock set quantity=1');await db.exec(sql);
expect((await db.query('select * from materials')).rows).toHaveLength(3);expect((await db.query('select quantity from warehouse_stock')).rows).toEqual([{quantity:'1'},{quantity:'1'}]);
await expect(db.query("select dmp_demo_prepare_inventory_examples('33333333-3333-3333-3333-333333333333')")).rejects.toThrow('empresa temporal no activa');
}finally{await db.close();}},30000);
