import { readFileSync, readdirSync } from 'node:fs';

// Only for a new, empty Supabase project. Never rewrite the live migrations.
export const demoExcludedMigrations = {
  '051_consolidate_operating_company.sql': 'Consolidates confirmed production company/profile UUIDs.',
  '061_normalize_operational_rate_catalog.sql': 'Requires specific historical rates and amounts from production.',
};
export function demoSchemaParts(root = process.cwd()) {
  const directory = `${root}/supabase/migrations`;
  const names = readdirSync(directory).filter(name => name.endsWith('.sql') && !(name in demoExcludedMigrations)).sort();
  const views = new Map();
  const parts = [];
  for (const name of names) {
    const original = readFileSync(`${directory}/${name}`, 'utf8');
    for (const match of original.matchAll(/create or replace view\s+(public\.\w+)[\s\S]*?;/gi)) views.set(match[1], match[0]);
    // On a fresh database older snapshots change view column order. Replacing
    // their intermediate views needs DROP; restore all final views afterwards.
    const sql = original.replace(/create or replace view\s+(public\.\w+)/gi, 'drop view if exists $1 cascade; create view $1');
    parts.push({ name, sql });
    if (name.startsWith('001_')) parts.push({ name: 'base_roles', sql: "insert into public.roles(name,description) select name,name from unnest(array['SAT','Comercial','Oficina','Gerencia','Tecnico']) name on conflict do nothing;" });
  }
  const finalViews = [...views.entries()];
  // Defer unresolved view dependencies and fail if a complete pass makes no progress.
  const blocks = finalViews.map(([name, sql]) => `begin execute ${quote(sql)}; exception when undefined_table or undefined_column then null; end;`).join('\n');
  const expected = finalViews.map(([name]) => quote(name)).join(',');
  const restoration = `do $restore$ declare remaining integer; previous integer := 2147483647; item record; begin
    loop
      ${blocks}
      select count(*) into remaining from unnest(array[${expected}]) name where to_regclass(name) is null;
      exit when remaining=0;
      if remaining >= previous then raise exception 'Demo: no se han podido restaurar % vistas; instalación cancelada', remaining; end if;
      previous := remaining;
    end loop;
    for item in select schemaname,viewname from pg_views where schemaname='public' loop
      execute format('alter view %I.%I set (security_invoker=true)',item.schemaname,item.viewname);
    end loop;
  end $restore$;`;
  parts.push({ name: 'restore_final_views', sql: restoration });
  return parts;
}
function quote(value) { return `'${value.replaceAll("'", "''")}'`; }

export function demoSchemaBundle(root = process.cwd()) {
  const preflight = `begin;
do $guard$ begin
  if to_regclass('public.companies') is not null then
    raise exception 'Demo: este instalador solo admite una base nueva sin DMP. No se ha modificado nada.';
  end if;
  if exists(select 1 from auth.users) then
    raise exception 'Demo: el proyecto debe empezar sin usuarios Auth. No se ha modificado nada.';
  end if;
end $guard$;`;
  const parts = demoSchemaParts(root).map(part => `-- ${part.name}\n${part.sql.replace(/^\s*(?:begin|commit);\s*$/gmi, '')}`);
  return `${preflight}\n${parts.join('\n\n')}\ncommit;\n`;
}

// Keep whole migrations together: splitting on semicolons would break functions.
export function demoEditorBlocks(root = process.cwd(), limit = 180000) {
  const groups = []; let group = []; let size = 0;
  for (const part of demoSchemaParts(root)) {
    const sql = `-- ${part.name}\n${part.sql.replace(/^\s*(?:begin|commit);\s*$/gmi, '')}`;
    const bytes = Buffer.byteLength(sql, 'utf8');
    if (bytes > limit) throw new Error(`Migration exceeds editor block limit: ${part.name}`);
    if (group.length && size + bytes > limit) { groups.push(group); group = []; size = 0; }
    group.push(sql); size += bytes;
  }
  if (group.length) groups.push(group);
  return groups.map((parts, index) => {
    const first = index === 0 ? `do $guard$ begin
      if to_regclass('public.companies') is not null or to_regclass('public.dmp_demo_install_progress') is not null then
        raise exception 'Demo: el primer bloque exige una base nueva';
      end if;
      if exists(select 1 from auth.users) then raise exception 'Demo: el proyecto debe estar sin usuarios Auth'; end if;
    end $guard$;
    create table public.dmp_demo_install_progress(id boolean primary key default true check(id), step integer not null);
    alter table public.dmp_demo_install_progress enable row level security;
    revoke all on public.dmp_demo_install_progress from public,anon,authenticated;
    insert into public.dmp_demo_install_progress values(true,0);` : '';
    return `-- BLOQUE ${index+1} DE ${groups.length}. Ejecutar en orden, solo en el proyecto de demo nuevo.\nbegin;\n${first}
    do $order$ begin
      perform 1 from public.dmp_demo_install_progress where id and step=${index} for update;
      if not found then raise exception 'Demo: bloque fuera de orden o ya ejecutado'; end if;
      if exists(select 1 from auth.users) then raise exception 'Demo: no crear usuarios durante la instalación'; end if;
    end $order$;\n${parts.join('\n\n')}\nupdate public.dmp_demo_install_progress set step=${index+1} where id;\ncommit;\n`;
  });
}
