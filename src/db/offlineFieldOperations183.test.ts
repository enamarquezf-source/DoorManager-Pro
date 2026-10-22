import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, afterEach, expect, it } from 'vitest';
const sql = readFileSync(new URL('../../supabase/migrations/183_offline_field_operations.sql', import.meta.url), 'utf8');
const company = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const work = '33333333-3333-4333-8333-333333333333';
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;
  create table companies(id uuid primary key);
  create table profiles(id uuid primary key,active boolean,deleted_at timestamptz);
  create table work_orders(id uuid primary key,company_id uuid,status text,deleted_at timestamptz,work_performed text,updated_at timestamptz);
  create table work_order_time_entries(id uuid primary key default gen_random_uuid(),work_order_id uuid,company_id uuid,updated_at timestamptz);
  create table work_order_cost_entries(id uuid primary key,work_order_id uuid,company_id uuid,updated_at timestamptz,deleted_at timestamptz);
  create table work_order_materials(id uuid primary key,work_order_id uuid,company_id uuid,updated_at timestamptz,deleted_at timestamptz);
  create table work_order_quote_line_decisions(work_order_id uuid,quote_line_id uuid,decision text,deleted_at timestamptz);
  create table work_order_planned_material_decisions(id uuid primary key default gen_random_uuid(),work_order_id uuid,quote_line_id uuid,decision text,deleted_at timestamptz);
  create table checks(id uuid primary key,work_order_id uuid,company_id uuid,technician_id uuid,deleted_at timestamptz);
  create table check_section_results(id uuid primary key,check_id uuid,section_id uuid,updated_at timestamptz,local_change_id text);
  create function current_profile_id() returns uuid language sql as $$select '${actor}'::uuid$$;
  create function assert_member_of_current_company(uuid) returns void language plpgsql as $$begin if $1 <> '${company}'::uuid then raise exception 'Otra empresa';end if;end$$;
  create function has_any_role(text[]) returns boolean language sql as $$select false$$;
  create function is_assigned_to_work_order(uuid,uuid) returns boolean language sql as $$select current_setting('test.assigned')::boolean$$;
  create function dmp_upsert_work_order_time_entry(jsonb) returns uuid language plpgsql as $$declare entry uuid;begin insert into work_order_time_entries(work_order_id,company_id,updated_at) values(($1->>'work_order_id')::uuid,'${company}',now()) returning id into entry;return entry;end$$;
  create function dmp_submit_work_order_material(jsonb) returns uuid language plpgsql as $$declare entry uuid:=gen_random_uuid();begin insert into work_order_materials(id,work_order_id,company_id,updated_at) values(entry,($1->>'work_order_id')::uuid,'${company}',now());return entry;end$$;
  create function dmp_set_work_order_planned_material_decision(jsonb) returns uuid language plpgsql as $$declare entry uuid;begin if $1->>'notes'='fail' then raise exception 'Invalid decision';end if;insert into work_order_planned_material_decisions(work_order_id,quote_line_id,decision) values(($1->>'work_order_id')::uuid,($1->>'quote_line_id')::uuid,$1->>'decision') returning id into entry;return entry;end$$;
  create function save_check_block_result(jsonb) returns uuid language plpgsql as $$declare entry uuid;begin
 insert into check_section_results(id,check_id,section_id,updated_at,local_change_id) values(gen_random_uuid(),($1->>'check_id')::uuid,($1->>'section_id')::uuid,clock_timestamp(),$1->>'local_change_id') returning id into entry;return entry;end$$;
  create function dmp_finalize_work_order_technical(uuid,jsonb) returns uuid language plpgsql as $$begin update work_orders set status='Finalizado tecnicamente' where id=$1;return $1;end$$;
  insert into companies values('${company}'); insert into profiles values('${actor}',true,null);
  insert into work_orders values('${work}','${company}','En curso',null,'Original',now());`);
  await db.exec(sql); await db.exec(sql);
}, 30000);
beforeEach(async () => { await db.exec("begin;select set_config('test.assigned','true',false);"); });
afterEach(async () => { await db.exec('rollback;'); });
afterAll(async () => { await db.close(); });
const send = (id: string, kind: string, payload: any) => db.query('select dmp_sync_field_operation($1,$2,$3,null,$4::jsonb) result', [id, kind, work, JSON.stringify(payload)]);
it('retries an acknowledged or lost-response operation without inserting duplicate hours', async () => {
  const first = await send('operation-123', 'time', { duration_minutes: 30 });
  const retry = await send('operation-123', 'time', { duration_minutes: 30 });
  expect(retry.rows).toEqual(first.rows);
  expect((await db.query('select * from work_order_time_entries')).rows).toHaveLength(1);
});
it('keeps a closure retry idempotent after the assignment and status change', async () => {
  await send('close-1234', 'work-finish', {});
  await db.exec("select set_config('test.assigned','false',false)");
  await expect(send('close-1234', 'work-finish', {})).resolves.toBeTruthy();
  expect((await db.query('select * from field_operation_receipts')).rows).toHaveLength(1);
});
it('blocks stale work text instead of overwriting server changes', async () => {
  await expect(send('conflict-123', 'work-fields', { expected_work_performed: 'Old', work_performed: 'Offline' })).rejects.toThrow('ha cambiado');
});
it('accepts sequential local work edits in their original order', async () => {
  await send('note-first', 'work-fields', { expected_work_performed: 'Original', work_performed: 'First' });
  await send('note-second', 'work-fields', { expected_work_performed: 'First', work_performed: 'Second' });
  expect((await db.query<any>('select work_performed from work_orders')).rows[0].work_performed).toBe('Second');
});
it('blocks new writes when an assignment is revoked', async () => {
  await db.exec("select set_config('test.assigned','false',false)");
  await expect(send('revoked-123', 'time', {})).rejects.toThrow('asignación ha cambiado');
});
it('blocks another company', async () => {
  await db.exec(`update work_orders set company_id=gen_random_uuid()`);
  await expect(send('company-123', 'time', {})).rejects.toThrow('Otra empresa');
});
it('refuses reuse of an operation ID with different contents', async () => {
  await send('collision-123', 'time', { duration_minutes: 30 });
  await expect(send('collision-123', 'time', { duration_minutes: 60 })).rejects.toThrow('otra operación');
});

it('sends planned consumption and its decision atomically and without duplicate materials', async () => {
  const payload = { quote_line_id: '55555555-5555-4555-8555-555555555555', decision: 'utilizado', quantity: 2, expected_decision: null };
  await send('planned-123', 'planned-material', payload);
  await send('planned-123', 'planned-material', payload);
  expect((await db.query('select * from work_order_materials')).rows).toHaveLength(1);
  expect((await db.query('select * from work_order_planned_material_decisions')).rows).toHaveLength(1);
});

it('rolls back consumption when its planned decision fails', async () => {
  await db.exec('savepoint operation');
  await expect(send('planned-fail', 'planned-material', { quote_line_id: '55555555-5555-4555-8555-555555555555', decision: 'utilizado', notes: 'fail' })).rejects.toThrow('Invalid decision');
  await db.exec('rollback to savepoint operation');
  expect((await db.query('select * from work_order_materials')).rows).toHaveLength(0);
  expect((await db.query('select * from field_operation_receipts')).rows).toHaveLength(0);
});

it('blocks an inactive profile even for a known receipt', async () => {
  await send('active-123', 'time', {});
  await db.exec('update profiles set active=false');
  await expect(send('active-123', 'time', {})).rejects.toThrow('Perfil desactivado');
});

it('protects a downloaded check block from another technician changing it', async () => {
  await db.exec(`insert into checks values('44444444-4444-4444-8444-444444444444','${work}','${company}','${actor}',null)`);
  const payload = { check_id: '44444444-4444-4444-8444-444444444444', section_id: '55555555-5555-4555-8555-555555555555', expected_section_updated_at: null, local_change_id: 'revision-one' };
  const first = await db.query('select dmp_save_check_block_offline($1::jsonb)', [JSON.stringify(payload)]);
  expect((await db.query('select dmp_save_check_block_offline($1::jsonb)', [JSON.stringify(payload)])).rows).toEqual(first.rows);
  await expect(db.query('select dmp_save_check_block_offline($1::jsonb)', [JSON.stringify({ ...payload, local_change_id: 'revision-two' })])).rejects.toThrow('Otro usuario ha cambiado');
});
