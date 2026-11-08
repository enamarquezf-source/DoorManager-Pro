import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
const sql = readFileSync('supabase/migrations/188_alert_recipient_visibility.sql','utf8');
it('restricts both RPC and direct reads to the recipient role, person or company-wide audience', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon; create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('dmp.actor',true),'')::uuid$$;
    create table profiles(id uuid primary key,company_id uuid,active boolean,deleted_at timestamptz,primary_area text);
    create function current_profile_id() returns uuid language sql as $$select auth.uid()$$;
    create function current_company_id() returns uuid language sql security definer as $$select company_id from profiles where id=auth.uid()$$;
    create function has_any_role(text[]) returns boolean language sql security definer as $$select primary_area=any($1) from profiles where id=auth.uid()$$;
    create function dmp024_active_profile() returns profiles language sql security definer as $$select p from profiles p where id=auth.uid() and active$$;
    create table alerts(id uuid primary key,company_id uuid,title text,description text,type text,status text,deleted_at timestamptz);
    create table alert_recipients(id uuid primary key,company_id uuid,alert_id uuid,recipient_profile_id uuid,recipient_role text,is_read boolean default false,read_at timestamptz,closed_at timestamptz,created_at timestamptz default now());
    create table alert_personal_states(recipient_id uuid,profile_id uuid,company_id uuid,is_read boolean,read_at timestamptz,closed_at timestamptz,primary key(recipient_id,profile_id));
    create function dmp_create_alert_atomic(uuid,jsonb,jsonb) returns alerts language sql as $$select a from alerts a limit 1$$;
    alter table alerts enable row level security; alter table alert_recipients enable row level security;
    create policy old_admin on alerts for select to authenticated using(true);
    create policy old_admin on alert_recipients for select to authenticated using(true);
    grant usage on schema auth to authenticated;
    grant select on alerts,alert_recipients to authenticated;`);
    await db.exec(sql);
    const company='00000000-0000-0000-0000-000000000001';
    const actor='00000000-0000-0000-0000-000000000002';
    const other='00000000-0000-0000-0000-000000000003';
    await db.query(`insert into profiles values ($1,$2,true,null,'SAT'),($3,$2,true,null,'Oficina')`,[actor,company,other]);
    for (const [index,role,person] of [[1,'SAT',null],[2,'Oficina',null],[3,'Todos',null],[4,null,other]] as const) {
      const id=`00000000-0000-0000-0000-${String(index+10).padStart(12,'0')}`;
      await db.query(`insert into alerts values($1,$2,$3,'','Operativo','Abierto',null)`,[id,company,String(index)]);
      await db.query(`insert into alert_recipients(id,company_id,alert_id,recipient_role,recipient_profile_id) values($1,$2,$1,$3,$4)`,[id,company,role,person]);
    }
    for (const [person,expected] of [[actor,['1','3']],[other,['2','3','4']]] as const) {
      await db.query(`select set_config('dmp.actor',$1,false)`,[person]);
      await db.exec('set role authenticated');
      const direct=await db.query<{title:string}>(`select title from alerts order by title`);
      expect(direct.rows.map(row=>row.title)).toEqual(expected);
      const rpc=await db.query<{item:any}>(`select dmp_list_personal_alerts('') as item`);
      expect(rpc.rows.map(row=>row.item.alerts.title).sort()).toEqual(expected);
      const recipients=await db.query(`select * from alert_recipients`);
      expect(recipients.rows).toHaveLength(expected.length);
      await db.exec('reset role');
    }
    await db.query(`select set_config('dmp.actor',$1,false)`,[actor]);
    for (const role of ['Gerencia','Comercial','Tecnico','superadmin']) {
      await db.query(`update profiles set primary_area=$1 where id=$2`,[role,actor]);
      await db.exec('set role authenticated');
      expect((await db.query<{title:string}>(`select title from alerts`)).rows.map(row=>row.title)).toEqual(['3']);
      const rpc=await db.query<{item:any}>(`select dmp_list_personal_alerts('') as item`);
      expect(rpc.rows.map(row=>row.item.alerts.title)).toEqual(['3']);
      await expect(db.query(`select dmp_update_alert_recipient('00000000-0000-0000-0000-000000000012','close')`)).rejects.toThrow('aviso no disponible');
      await db.exec('reset role');
    }
    await db.query(`update profiles set company_id='00000000-0000-0000-0000-000000000099' where id=$1`,[actor]);
    await db.exec('set role authenticated');
    expect((await db.query(`select * from alerts`)).rows).toEqual([]);
    expect((await db.query(`select dmp_list_personal_alerts('')`)).rows).toEqual([]);
  } finally { await db.close(); }
},30000);
