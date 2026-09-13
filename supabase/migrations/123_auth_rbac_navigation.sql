-- DoorManager Pro - canonical AUTH/RBAC and navigation metadata.
-- Additive and idempotent. This migration must be reviewed before deployment.
begin;

-- Fail before creating RBAC objects when the deployed role model is not one
-- of the two historical contracts from migrations 001 and 007.
do $$
begin
  if to_regclass('public.roles') is null or to_regclass('public.profile_roles') is null then
    raise exception '123 precheck failed: roles/profile_roles missing';
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.roles'::regclass
      and c.conname = 'roles_name_check'
      and c.contype = 'c'
      and c.convalidated
  ) then
    raise exception '123 precheck failed: roles_name_check missing or invalid';
  end if;
  if (select count(*) from public.roles where name in ('SAT','Comercial','Oficina','Gerencia','Tecnico')) <> 5 then
    raise exception '123 precheck failed: base role rows missing';
  end if;
  if exists (select 1 from public.roles where name not in ('superadmin','SAT','Comercial','Oficina','Gerencia','Tecnico')) then
    raise exception '123 precheck failed: unexpected role rows';
  end if;
end $$;

-- Migration 007 established this exact canonical role vocabulary. Some
-- deployed schemas retained the legacy 001 CHECK, so restore it before seed.
alter table public.roles drop constraint roles_name_check;
alter table public.roles add constraint roles_name_check
  check (name in ('superadmin','SAT','Comercial','Oficina','Gerencia','Tecnico'));

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table if not exists public.profile_permission_grants (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  granted boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, permission_id)
);

create table if not exists public.app_modules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profile_module_visibility (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  module_id uuid not null references public.app_modules(id) on delete cascade,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, module_id)
);

create index if not exists role_permissions_permission_idx on public.role_permissions(permission_id);
create index if not exists profile_permission_grants_permission_idx on public.profile_permission_grants(permission_id, granted);
create index if not exists profile_module_visibility_module_idx on public.profile_module_visibility(module_id, visible);

insert into public.roles (name, description)
values ('superadmin', 'Propietario DMP con permisos globales de administracion')
on conflict (name) do nothing;

insert into public.permissions (code, description) values
  ('users.read', 'Consultar usuarios de la empresa'), ('users.create', 'Crear usuarios de la empresa'), ('users.update', 'Actualizar usuarios de la empresa'), ('users.deactivate', 'Activar o desactivar usuarios'),
  ('suppliers.read', 'Consultar proveedores'), ('suppliers.create', 'Crear proveedores'), ('suppliers.update', 'Actualizar proveedores'),
  ('purchase_orders.read', 'Consultar pedidos de compra'), ('purchase_orders.create', 'Crear pedidos de compra'), ('purchase_orders.update', 'Modificar pedidos de compra'), ('purchase_orders.submit', 'Enviar pedidos de compra'), ('purchase_orders.cancel', 'Cancelar pedidos de compra'),
  ('purchase_receipts.read', 'Consultar recepciones'), ('purchase_receipts.create', 'Crear recepciones'), ('purchase_receipts.update', 'Modificar recepciones'), ('purchase_receipts.confirm', 'Confirmar recepciones'), ('purchase_receipts.cancel', 'Cancelar recepciones'),
  ('materials.read', 'Consultar materiales'), ('materials.create', 'Crear materiales'), ('materials.update', 'Actualizar materiales'), ('materials.archive', 'Archivar materiales'),
  ('stock.read', 'Consultar stock'), ('stock.adjust', 'Ajustar stock de almacen'),
  ('sat.read', 'Consultar operaciones SAT'), ('sat.write', 'Gestionar operaciones SAT'), ('sat.assign', 'Asignar operaciones SAT'), ('sat.checks.manage', 'Gestionar checks SAT'),
  ('commercial.read', 'Consultar actividad comercial'), ('commercial.write', 'Gestionar actividad comercial'),
  ('documents.read', 'Consultar documentacion'), ('documents.create', 'Crear documentacion'), ('documents.update', 'Actualizar documentacion'),
  ('billing.read', 'Consultar facturacion y cobros'), ('billing.write', 'Gestionar facturacion y cobros'),
  ('admin.users.read', 'Consultar usuarios de la empresa'), ('admin.users.update', 'Actualizar usuarios de la empresa'), ('admin.roles.manage', 'Gestionar roles y permisos'), ('admin.modules.manage', 'Gestionar visibilidad de modulos'), ('admin.audit.read', 'Consultar auditoria')
on conflict (code) do update set description = excluded.description;

insert into public.app_modules (code, label, sort_order) values
  ('users', 'Usuarios', 10), ('suppliers', 'Proveedores', 20), ('purchase_orders', 'Pedidos de compra', 30), ('purchase_receipts', 'Recepciones', 40),
  ('materials', 'Materiales', 50), ('stock', 'Almacen y stock', 60), ('sat', 'SAT', 70), ('commercial', 'Comercial', 80), ('documents', 'Documentos', 90), ('billing', 'Facturacion y cobros', 100), ('admin', 'Administracion', 110)
on conflict (code) do update set label = excluded.label, sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.name = 'superadmin'
  and p.code in (select code from public.permissions)
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.name = 'Gerencia'
  and p.code in ('users.read','users.update','users.deactivate','suppliers.read','suppliers.create','suppliers.update','purchase_orders.read','purchase_orders.create','purchase_orders.update','purchase_orders.submit','purchase_orders.cancel','purchase_receipts.read','purchase_receipts.create','purchase_receipts.update','purchase_receipts.confirm','purchase_receipts.cancel','materials.read','materials.create','materials.update','materials.archive','stock.read','stock.adjust','sat.read','sat.write','sat.assign','sat.checks.manage','commercial.read','commercial.write','documents.read','documents.create','documents.update','billing.read','billing.write')
on conflict do nothing;

-- Remove any legacy access-management defaults; these keys are superadmin-only.
delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id and rp.permission_id = p.id
  and r.name = 'Gerencia'
  and p.code in ('admin.roles.manage','admin.modules.manage');

-- profile_roles is canonical. Legacy primary_area is only backfilled when no
-- role rows exist, and only when it names an existing role.
insert into public.profile_roles(profile_id, role_id)
select p.id, r.id
from public.profiles p
join public.roles r on r.name = p.primary_area
where p.primary_area in ('superadmin','SAT','Comercial','Oficina','Gerencia','Tecnico')
  and not exists (select 1 from public.profile_roles existing where existing.profile_id = p.id)
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.name in ('SAT','Gerencia','Oficina') and p.code in ('stock.read','stock.adjust')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.name = 'Oficina' and p.code in ('users.read','suppliers.read','suppliers.create','suppliers.update','purchase_orders.read','purchase_orders.create','purchase_orders.update','purchase_orders.submit','purchase_orders.cancel','purchase_receipts.read','purchase_receipts.create','purchase_receipts.update','purchase_receipts.confirm','purchase_receipts.cancel','materials.read','materials.create','materials.update','materials.archive','documents.read','documents.create','documents.update','billing.read','billing.write')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.name = 'SAT' and p.code in ('users.read','suppliers.read','purchase_orders.read','purchase_receipts.read','materials.read','sat.read','sat.write','sat.assign','sat.checks.manage','documents.read')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.name = 'Comercial' and p.code in ('users.read','suppliers.read','materials.read','commercial.read','commercial.write','documents.read','documents.create','documents.update','sat.read')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.name = 'Tecnico' and p.code in ('materials.read','stock.read','sat.read','sat.write','sat.checks.manage','documents.read')
on conflict do nothing;

-- User grants are additive only; clean up any legacy deny-shaped rows.
delete from public.profile_permission_grants where not granted;

create or replace function public.dmp_profile_has_permission(p_profile_id uuid, p_permission text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_profile_id and p.active and p.deleted_at is null
      and ((p_profile_id = public.current_profile_id() and public.is_platform_superadmin())
        or exists (select 1 from public.profile_roles pr join public.roles r on r.id = pr.role_id where pr.profile_id = p.id and r.name = 'superadmin')
        or exists (select 1 from public.profile_permission_grants g join public.permissions x on x.id = g.permission_id where g.profile_id = p.id and g.granted and x.code = p_permission)
        or exists (select 1 from public.profile_roles pr join public.role_permissions rp on rp.role_id = pr.role_id join public.permissions x on x.id = rp.permission_id where pr.profile_id = p.id and x.code = p_permission))
  );
$$;
revoke all on function public.dmp_profile_has_permission(uuid, text) from public, anon;
grant execute on function public.dmp_profile_has_permission(uuid, text) to authenticated;

create or replace function public.dmp_module_default_visible(p_profile_id uuid, p_module_code text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.permissions x
    where x.code like p_module_code || '.%'
      and public.dmp_profile_has_permission(p_profile_id, x.code)
  );
$$;
revoke all on function public.dmp_module_default_visible(uuid, text) from public, anon;
grant execute on function public.dmp_module_default_visible(uuid, text) to authenticated;

create or replace function public.dmp_can_manage_tenant_superadmin_target(p_profile_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select not exists (
    select 1
    from public.profile_roles target_pr
    join public.roles target_role on target_role.id = target_pr.role_id
    where target_pr.profile_id = p_profile_id
      and target_role.name = 'superadmin'
      and not public.is_platform_superadmin()
      and not exists (
        select 1
        from public.profile_roles actor_pr
        join public.roles actor_role on actor_role.id = actor_pr.role_id
        where actor_pr.profile_id = public.current_profile_id()
          and actor_role.name = 'superadmin'
      )
  );
$$;
revoke all on function public.dmp_can_manage_tenant_superadmin_target(uuid) from public, anon;
grant execute on function public.dmp_can_manage_tenant_superadmin_target(uuid) to authenticated;

-- Defaults are explicit so a profile grant never depends on frontend role logic.
insert into public.profile_module_visibility (profile_id, module_id, visible)
select p.id, m.id, true
from public.profiles p
cross join public.app_modules m
where p.active = true and p.deleted_at is null
  and exists (select 1 from public.profile_roles pr join public.roles r on r.id = pr.role_id join public.role_permissions rp on rp.role_id = r.id join public.permissions x on x.id = rp.permission_id where pr.profile_id = p.id and x.code like m.code || '.%')
on conflict (profile_id, module_id) do nothing;

create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.dmp_profile_has_permission(public.current_profile_id(), p_permission);
$$;

revoke all on function public.has_permission(text) from public, anon;
grant execute on function public.has_permission(text) to authenticated;

-- Keep old callers compatible while making role checks tenant-safe.
create or replace function public.has_any_role(role_names text[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_superadmin() or exists (
    select 1 from public.profiles p
    where p.id = public.current_profile_id() and p.active and p.deleted_at is null
       and exists (select 1 from public.profile_roles pr join public.roles r on r.id = pr.role_id where pr.profile_id = p.id and r.name = any(role_names))
  );
$$;
revoke all on function public.has_any_role(text[]) from public, anon;
grant execute on function public.has_any_role(text[]) to authenticated;

create or replace function public.dmp_admin_list_users()
returns setof public.profiles
language plpgsql security definer set search_path = public
as $$
begin
  if not (public.has_permission('users.read') or public.has_permission('admin.users.read')) then raise exception 'permiso: no puedes consultar usuarios'; end if;
  return query select p from public.profiles p where public.is_platform_superadmin() or p.company_id = public.current_company_id() order by p.last_name, p.first_name, p.id;
end;
$$;

create or replace function public.dmp_admin_update_user(p_profile_id uuid, p_payload jsonb)
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare
  v_actor public.profiles;
  v_old public.profiles;
  v_new public.profiles;
begin
  -- The schema has no canonical target marker for platform administrators;
  -- self-protection remains enforced without treating tenant superadmin as platform.
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'validacion del formulario: no hay cambios de usuario'; end if;
  if not exists (select 1 from jsonb_object_keys(p_payload)) then raise exception 'validacion del formulario: no hay cambios de usuario'; end if;
  if exists (select 1 from jsonb_object_keys(p_payload) key where key not in ('first_name','last_name','email','phone','active')) then raise exception 'validacion del formulario: campo de usuario no permitido'; end if;
  if p_payload ? 'active' and not public.has_permission('users.deactivate') then raise exception 'permiso: no puedes activar o desactivar usuarios'; end if;
  if (p_payload ? 'first_name' or p_payload ? 'last_name' or p_payload ? 'email' or p_payload ? 'phone') and not (public.has_permission('users.update') or public.has_permission('admin.users.update')) then raise exception 'permiso: no puedes actualizar usuarios'; end if;
  select * into v_actor from public.profiles where id = public.current_profile_id() and active and deleted_at is null;
  select * into v_old from public.profiles where id = p_profile_id for update;
  if v_actor.id is null or v_old.id is null or (not public.is_platform_superadmin() and v_old.company_id <> v_actor.company_id) then raise exception 'seguridad: usuario fuera de la empresa'; end if;
  if v_old.id = v_actor.id then raise exception 'seguridad: no puedes bloquearte ni modificar tu propio perfil'; end if;
  if not public.dmp_can_manage_tenant_superadmin_target(v_old.id) then raise exception 'seguridad: Este usuario tiene privilegios de Superadmin'; end if;
  if exists (select 1 from public.profile_roles pr join public.roles r on r.id = pr.role_id where pr.profile_id = v_old.id and r.name = 'superadmin') and not public.is_platform_superadmin() and not exists (select 1 from public.profile_roles pr join public.roles r on r.id = pr.role_id where pr.profile_id = v_actor.id and r.name = 'superadmin') then raise exception 'seguridad: Este usuario tiene privilegios de Superadmin'; end if;
  update public.profiles set
    first_name = coalesce(nullif(p_payload->>'first_name',''), first_name),
    last_name = coalesce(nullif(p_payload->>'last_name',''), last_name),
    email = coalesce(nullif(lower(p_payload->>'email'),''), email),
    phone = case when p_payload ? 'phone' then nullif(p_payload->>'phone','') else phone end,
     primary_area = coalesce((select r.name from public.profile_roles pr join public.roles r on r.id = pr.role_id where pr.profile_id = v_old.id order by pr.role_id limit 1), primary_area),
    active = case when p_payload ? 'active' then (p_payload->>'active')::boolean else active end,
    updated_at = now()
  where id = v_old.id and (public.is_platform_superadmin() or company_id = v_actor.company_id)
  returning * into v_new;
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)
  values (v_old.company_id, 'profiles', v_old.id, 'UPDATE', v_actor.id, to_jsonb(v_old), to_jsonb(v_new));
  return v_new;
end;
$$;

create or replace function public.dmp_admin_get_user_access(p_profile_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor public.profiles;
  v_target public.profiles;
  v_roles jsonb;
  v_grants jsonb;
  v_modules jsonb;
begin
  if not public.has_permission('admin.users.read') then raise exception 'permiso: no puedes consultar accesos'; end if;
  select * into v_actor from public.profiles where id = public.current_profile_id() and active and deleted_at is null;
  select * into v_target from public.profiles where id = p_profile_id;
  if v_actor.id is null or v_target.id is null or (not public.is_platform_superadmin() and v_target.company_id <> v_actor.company_id) then raise exception 'seguridad: usuario fuera de la empresa'; end if;
  select coalesce(jsonb_agg(r.name order by r.name), '[]'::jsonb) into v_roles
  from public.profile_roles pr join public.roles r on r.id = pr.role_id where pr.profile_id = v_target.id;
  select coalesce(jsonb_agg(jsonb_build_object('code', x.code, 'granted', g.granted) order by x.code), '[]'::jsonb) into v_grants
   from public.profile_permission_grants g join public.permissions x on x.id = g.permission_id where g.profile_id = v_target.id and g.granted;
   select coalesce(jsonb_agg(jsonb_build_object('code', m.code, 'label', m.label, 'visible', coalesce(v.visible, public.dmp_module_default_visible(v_target.id, m.code))) order by m.sort_order), '[]'::jsonb) into v_modules
  from public.app_modules m left join public.profile_module_visibility v on v.module_id = m.id and v.profile_id = v_target.id where m.active;
  return jsonb_build_object('profile', to_jsonb(v_target), 'roles', v_roles, 'permission_grants', v_grants, 'module_visibility', v_modules);
end;
$$;

create or replace function public.dmp_admin_update_user_access(
  p_profile_id uuid,
  p_role_names text[] default null,
  p_permission_grants jsonb default '[]'::jsonb,
  p_module_visibility jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor public.profiles;
  v_target public.profiles;
  v_item jsonb;
  v_code text;
  v_role_id uuid;
  v_permission_id uuid;
  v_module_id uuid;
  v_old_roles jsonb;
  v_old_grants jsonb;
  v_old_modules jsonb;
begin
  if p_role_names is null and jsonb_array_length(coalesce(p_permission_grants, '[]'::jsonb)) = 0 and jsonb_array_length(coalesce(p_module_visibility, '[]'::jsonb)) = 0 then raise exception 'seguridad: no hay cambios de acceso'; end if;
  if p_role_names is not null and cardinality(p_role_names) = 0 then raise exception 'seguridad: debe existir al menos un rol'; end if;
  select * into v_actor from public.profiles where id = public.current_profile_id() and active and deleted_at is null;
  select * into v_target from public.profiles where id = p_profile_id for update;
  if v_actor.id is null or v_target.id is null or (not public.is_platform_superadmin() and v_target.company_id <> v_actor.company_id) then raise exception 'seguridad: usuario fuera de la empresa'; end if;
  if v_target.id = v_actor.id then raise exception 'seguridad: no puedes elevar ni bloquear tu propio acceso'; end if;
  if not public.dmp_can_manage_tenant_superadmin_target(v_target.id) then raise exception 'seguridad: Este usuario tiene privilegios de Superadmin'; end if;
  if p_role_names is not null and not public.has_permission('admin.roles.manage') then raise exception 'permiso: no puedes gestionar roles'; end if;
  if jsonb_array_length(coalesce(p_permission_grants, '[]'::jsonb)) > 0 and not public.has_permission('admin.roles.manage') then raise exception 'permiso: no puedes gestionar permisos'; end if;
  if jsonb_array_length(coalesce(p_module_visibility, '[]'::jsonb)) > 0 and not public.has_permission('admin.modules.manage') then raise exception 'permiso: no puedes gestionar modulos'; end if;
  if p_role_names is not null and exists (select 1 from unnest(p_role_names) n where n not in ('superadmin','SAT','Comercial','Oficina','Gerencia','Tecnico')) then raise exception 'seguridad: rol no permitido'; end if;
  select coalesce(jsonb_agg(r.name order by r.name), '[]'::jsonb) into v_old_roles from public.profile_roles pr join public.roles r on r.id = pr.role_id where pr.profile_id = v_target.id;
  select coalesce(jsonb_agg(jsonb_build_object('code', x.code, 'granted', g.granted) order by x.code), '[]'::jsonb) into v_old_grants from public.profile_permission_grants g join public.permissions x on x.id = g.permission_id where g.profile_id = v_target.id;
  select coalesce(jsonb_agg(jsonb_build_object('code', m.code, 'visible', v.visible) order by m.code), '[]'::jsonb) into v_old_modules from public.profile_module_visibility v join public.app_modules m on m.id = v.module_id where v.profile_id = v_target.id;
  if p_role_names is not null then
    delete from public.profile_roles where profile_id = v_target.id;
    insert into public.profile_roles(profile_id, role_id) select v_target.id, r.id from public.roles r where r.name = any(p_role_names);
    update public.profiles set primary_area = coalesce((select r.name from public.profile_roles pr join public.roles r on r.id = pr.role_id where pr.profile_id = v_target.id and r.name = any(p_role_names) order by array_position(p_role_names, r.name) limit 1), primary_area), updated_at = now() where id = v_target.id;
  end if;
  for v_item in select value from jsonb_array_elements(coalesce(p_permission_grants, '[]'::jsonb)) loop
    v_code := nullif(v_item->>'code', '');
    select id into v_permission_id from public.permissions where code = v_code;
    if v_permission_id is null or not (v_item ? 'granted') then raise exception 'seguridad: permiso invalido'; end if;
    if (v_item->>'granted')::boolean then
      insert into public.profile_permission_grants(profile_id, permission_id, granted, updated_at) values (v_target.id, v_permission_id, true, now()) on conflict (profile_id, permission_id) do update set granted = true, updated_at = now();
    else
      delete from public.profile_permission_grants where profile_id = v_target.id and permission_id = v_permission_id;
    end if;
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_module_visibility, '[]'::jsonb)) loop
    v_code := nullif(v_item->>'code', '');
    select id into v_module_id from public.app_modules where code = v_code and active;
    if v_module_id is null or not (v_item ? 'visible') then raise exception 'seguridad: modulo invalido'; end if;
    insert into public.profile_module_visibility(profile_id, module_id, visible, updated_at) values (v_target.id, v_module_id, (v_item->>'visible')::boolean, now()) on conflict (profile_id, module_id) do update set visible = excluded.visible, updated_at = now();
  end loop;
  if p_role_names is not null then insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_target.company_id, 'profile_roles', v_target.id, 'UPDATE', v_actor.id, v_old_roles, to_jsonb(p_role_names)); end if;
  if jsonb_array_length(coalesce(p_permission_grants, '[]'::jsonb)) > 0 then insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_target.company_id, 'profile_permission_grants', v_target.id, 'UPDATE', v_actor.id, v_old_grants, p_permission_grants); end if;
  if jsonb_array_length(coalesce(p_module_visibility, '[]'::jsonb)) > 0 then insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_target.company_id, 'profile_module_visibility', v_target.id, 'UPDATE', v_actor.id, v_old_modules, p_module_visibility); end if;
  return public.dmp_admin_get_user_access(v_target.id);
end;
$$;

revoke all on function public.dmp_admin_list_users() from public, anon;
revoke all on function public.dmp_admin_update_user(uuid, jsonb) from public, anon;
revoke all on function public.dmp_admin_get_user_access(uuid) from public, anon;
revoke all on function public.dmp_admin_update_user_access(uuid, text[], jsonb, jsonb) from public, anon;
grant execute on function public.dmp_admin_list_users() to authenticated;
grant execute on function public.dmp_admin_update_user(uuid, jsonb) to authenticated;
grant execute on function public.dmp_admin_get_user_access(uuid) to authenticated;
grant execute on function public.dmp_admin_update_user_access(uuid, text[], jsonb, jsonb) to authenticated;

create or replace function public.dmp_get_current_access()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'permissions', coalesce((select jsonb_agg(x.code order by x.code) from public.permissions x where public.has_permission(x.code)), '[]'::jsonb),
     'modules', coalesce((select jsonb_agg(jsonb_build_object('code', m.code, 'visible', coalesce(v.visible, public.dmp_module_default_visible(public.current_profile_id(), m.code))) order by m.sort_order) from public.app_modules m left join public.profile_module_visibility v on v.module_id = m.id and v.profile_id = public.current_profile_id() where m.active), '[]'::jsonb)
  );
$$;
revoke all on function public.dmp_get_current_access() from public, anon;
grant execute on function public.dmp_get_current_access() to authenticated;

alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profile_permission_grants enable row level security;
alter table public.app_modules enable row level security;
alter table public.profile_module_visibility enable row level security;
revoke all on public.permissions, public.role_permissions, public.profile_permission_grants, public.app_modules, public.profile_module_visibility from anon, authenticated;
grant select on public.permissions, public.role_permissions, public.app_modules to authenticated;
drop policy if exists permissions_authenticated_read on public.permissions;
drop policy if exists role_permissions_authenticated_read on public.role_permissions;
drop policy if exists app_modules_authenticated_read on public.app_modules;
create policy permissions_authenticated_read on public.permissions for select to authenticated using (true);
create policy role_permissions_authenticated_read on public.role_permissions for select to authenticated using (true);
create policy app_modules_authenticated_read on public.app_modules for select to authenticated using (active);

-- Stock remains callable only by authenticated sessions and now uses canonical RBAC.
create or replace function public.dmp_adjust_warehouse_stock(p_warehouse_id uuid, p_material_id uuid, p_movement_type text, p_quantity numeric, p_reason text, p_idempotency_key text default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_actor public.profiles := public.dmp024_active_profile();
  v_warehouse public.warehouses;
  v_material public.materials;
  v_stock public.warehouse_stock;
  v_existing public.stock_movements;
  v_new numeric;
  v_delta numeric;
  v_company uuid;
begin
  if not public.has_permission('stock.adjust') then raise exception 'permiso: no tienes permiso para ajustar stock'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'validacion del formulario: la cantidad debe ser mayor que cero'; end if;
  if p_movement_type not in ('Entrada','Salida','Devolucion','Ajuste') then raise exception 'validacion del formulario: tipo de movimiento no valido'; end if;
  if trim(coalesce(p_reason, '')) = '' then raise exception 'validacion del formulario: el motivo es obligatorio'; end if;
  select * into v_warehouse from public.warehouses where id = p_warehouse_id and active and deleted_at is null;
  select * into v_material from public.materials where id = p_material_id and deleted_at is null;
  if v_warehouse.id is null or v_material.id is null or v_warehouse.company_id <> v_material.company_id then raise exception 'stock: almacen/material no valido para la empresa'; end if;
  v_company := v_material.company_id;
  if not public.is_platform_superadmin() and v_company <> public.current_company_id() then raise exception 'empresa: registro no pertenece a la empresa actual'; end if;
  if p_idempotency_key is not null then
    select * into v_existing from public.stock_movements where company_id = v_company and idempotency_key = p_idempotency_key;
    if v_existing.id is not null then
      if v_existing.company_id <> v_company or v_existing.warehouse_id <> p_warehouse_id or v_existing.material_id <> p_material_id or v_existing.movement_type <> p_movement_type or (p_movement_type <> 'Ajuste' and v_existing.quantity <> p_quantity) then raise exception 'conflicto: la clave idempotente ya se uso para otro movimiento de stock'; end if;
      select quantity into v_new from public.warehouse_stock where company_id = v_company and warehouse_id = p_warehouse_id and material_id = p_material_id;
      return v_new;
    end if;
  end if;
  insert into public.warehouse_stock(company_id, warehouse_id, material_id, quantity) values (v_company, p_warehouse_id, p_material_id, 0) on conflict (warehouse_id, material_id) do nothing;
  select * into v_stock from public.warehouse_stock where company_id = v_company and warehouse_id = p_warehouse_id and material_id = p_material_id for update;
  v_delta := case when p_movement_type in ('Entrada','Devolucion') then p_quantity when p_movement_type = 'Ajuste' then p_quantity - v_stock.quantity else -p_quantity end;
  v_new := v_stock.quantity + v_delta;
  if v_new < 0 and not coalesce(v_material.allow_negative_stock, false) then raise exception 'stock: stock insuficiente para %', v_material.code; end if;
  update public.warehouse_stock set quantity = v_new, updated_at = now() where id = v_stock.id;
  insert into public.stock_movements(company_id, warehouse_id, material_id, movement_type, quantity, created_by, notes, idempotency_key) values (v_company, p_warehouse_id, p_material_id, p_movement_type, abs(v_delta), v_actor.id, p_reason, p_idempotency_key);
  return v_new;
end; $$;
revoke all on function public.dmp_adjust_warehouse_stock(uuid,uuid,text,numeric,text,text) from public, anon;
grant execute on function public.dmp_adjust_warehouse_stock(uuid,uuid,text,numeric,text,text) to authenticated;

revoke all on function public.dmp_create_material_with_stock(jsonb), public.dmp_create_purchase_order(uuid,uuid,date,uuid,text,text), public.dmp_update_purchase_order(uuid,uuid,date,uuid,text,text), public.dmp_add_purchase_order_line(uuid,uuid,uuid,numeric,numeric), public.dmp_update_purchase_order_line(uuid,uuid,uuid,numeric,numeric), public.dmp_remove_purchase_order_line(uuid), public.dmp_order_purchase_order(uuid), public.dmp_cancel_purchase_order(uuid), public.dmp_create_purchase_receipt(uuid,date,uuid,text,text), public.dmp_update_purchase_receipt(uuid,date,uuid,text,text), public.dmp_add_purchase_receipt_line(uuid,uuid,numeric,numeric), public.dmp_update_purchase_receipt_line(uuid,numeric,numeric), public.dmp_remove_purchase_receipt_line(uuid), public.dmp_confirm_purchase_receipt(uuid), public.dmp_cancel_draft_purchase_receipt(uuid) from public, anon;
grant execute on function public.dmp_create_material_with_stock(jsonb), public.dmp_create_purchase_order(uuid,uuid,date,uuid,text,text), public.dmp_update_purchase_order(uuid,uuid,date,uuid,text,text), public.dmp_add_purchase_order_line(uuid,uuid,uuid,numeric,numeric), public.dmp_update_purchase_order_line(uuid,uuid,uuid,numeric,numeric), public.dmp_remove_purchase_order_line(uuid), public.dmp_order_purchase_order(uuid), public.dmp_cancel_purchase_order(uuid), public.dmp_create_purchase_receipt(uuid,date,uuid,text,text), public.dmp_update_purchase_receipt(uuid,date,uuid,text,text), public.dmp_add_purchase_receipt_line(uuid,uuid,numeric,numeric), public.dmp_update_purchase_receipt_line(uuid,numeric,numeric), public.dmp_remove_purchase_receipt_line(uuid), public.dmp_confirm_purchase_receipt(uuid), public.dmp_cancel_draft_purchase_receipt(uuid) to authenticated;

-- Explicitly rebind the certified transactional RPCs. Do not derive executable
-- SQL from catalog text: every authorization boundary is reviewable here.
create or replace function public.dmp_create_material_with_stock(p_payload jsonb)
returns public.materials language plpgsql security definer set search_path = public as $$
declare v_actor public.profiles := public.dmp024_active_profile(); v_company uuid := coalesce(nullif(p_payload->>'company_id','')::uuid, public.current_company_id()); v_material public.materials; v_warehouse uuid := nullif(p_payload->>'warehouse_id','')::uuid; v_quantity numeric := coalesce(nullif(p_payload->>'initial_quantity','')::numeric, 0); v_code text;
begin
  if not public.has_permission('materials.create') then raise exception 'permiso: no tienes permiso para crear materiales'; end if;
  perform public.assert_member_of_current_company(v_company);
  if trim(coalesce(p_payload->>'description','')) = '' then raise exception 'material: la descripcion es obligatoria'; end if;
  if v_quantity < 0 then raise exception 'stock: la cantidad inicial no puede ser negativa'; end if;
  v_code := coalesce(nullif(trim(p_payload->>'code'),''), public.next_dmp_code(v_company,'materials','MAT',false,6));
  insert into public.materials(company_id,code,description,manufacturer,reference,unit,cost,price,minimum_stock,stock_controlled,allow_negative_stock,is_specific,made_to_measure,single_use,active) values(v_company,v_code,trim(p_payload->>'description'),nullif(trim(p_payload->>'manufacturer'),''),nullif(trim(p_payload->>'reference'),''),coalesce(nullif(trim(p_payload->>'unit'),''),'ud'),coalesce(nullif(p_payload->>'cost','')::numeric,0),coalesce(nullif(p_payload->>'price','')::numeric,0),coalesce(nullif(p_payload->>'minimum_stock','')::numeric,0),coalesce((p_payload->>'stock_controlled')::boolean,true),coalesce((p_payload->>'allow_negative_stock')::boolean,false),coalesce((p_payload->>'is_specific')::boolean,false),coalesce((p_payload->>'made_to_measure')::boolean,false),coalesce((p_payload->>'single_use')::boolean,false),coalesce((p_payload->>'active')::boolean,true)) returning * into v_material;
  if v_quantity > 0 then if v_warehouse is null then raise exception 'stock: selecciona un almacen para el stock inicial'; end if; perform public.dmp_adjust_warehouse_stock(v_warehouse,v_material.id,'Entrada',v_quantity,'Stock inicial al crear material','material-create:' || v_material.id); end if;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v_company,'materials',v_material.id,'MATERIAL_CREATE',v_actor.id,null,to_jsonb(v_material)); return v_material;
end $$;

create or replace function public.dmp_create_purchase_order(p_company_id uuid,p_supplier_id uuid,p_order_date date default current_date,p_destination_warehouse_id uuid default null,p_supplier_reference text default null,p_notes text default null) returns uuid language plpgsql security definer set search_path=public as $$ declare v_id uuid; v_created_by uuid:=public.current_profile_id(); begin perform public.assert_member_of_current_company(p_company_id); if not public.has_permission('purchase_orders.create') then raise exception 'permiso: no puedes gestionar pedidos de compra'; end if; if not exists(select 1 from public.suppliers where id=p_supplier_id and company_id=p_company_id and active and deleted_at is null) then raise exception 'empresa: proveedor no válido para la empresa'; end if; if p_destination_warehouse_id is not null and not exists(select 1 from public.warehouses where id=p_destination_warehouse_id and company_id=p_company_id and active and deleted_at is null) then raise exception 'empresa: almacén no válido para la empresa'; end if; insert into public.purchase_orders(company_id,code,supplier_id,order_date,destination_warehouse_id,supplier_reference,notes,created_by) values(p_company_id,public.next_dmp_code(p_company_id,'purchase_orders','PED',true,6),p_supplier_id,coalesce(p_order_date,current_date),p_destination_warehouse_id,nullif(p_supplier_reference,''),nullif(p_notes,''),v_created_by) returning id into v_id; return v_id; end; $$;
create or replace function public.dmp_update_purchase_order(p_purchase_order_id uuid,p_supplier_id uuid,p_order_date date,p_destination_warehouse_id uuid default null,p_supplier_reference text default null,p_notes text default null) returns uuid language plpgsql security definer set search_path=public as $$ declare v_order public.purchase_orders%rowtype; begin select * into v_order from public.purchase_orders where id=p_purchase_order_id; if not found or (not public.is_platform_superadmin() and v_order.company_id is distinct from public.current_company_id()) then raise exception 'pedido de compra: registro no disponible'; end if; if v_order.status<>'draft' then raise exception 'pedido de compra: solo el borrador es editable'; end if; if not public.has_permission('purchase_orders.update') then raise exception 'permiso: no puedes gestionar pedidos de compra'; end if; if not exists(select 1 from public.suppliers where id=p_supplier_id and company_id=v_order.company_id and active and deleted_at is null) then raise exception 'empresa: proveedor no válido para la empresa'; end if; if p_destination_warehouse_id is not null and not exists(select 1 from public.warehouses where id=p_destination_warehouse_id and company_id=v_order.company_id and active and deleted_at is null) then raise exception 'empresa: almacén no válido para la empresa'; end if; update public.purchase_orders set supplier_id=p_supplier_id,order_date=coalesce(p_order_date,order_date),destination_warehouse_id=p_destination_warehouse_id,supplier_reference=nullif(p_supplier_reference,''),notes=nullif(p_notes,''),updated_at=now() where id=p_purchase_order_id; return p_purchase_order_id; end; $$;
create or replace function public.dmp_add_purchase_order_line(p_purchase_order_id uuid,p_material_id uuid,p_material_supplier_id uuid,p_ordered_quantity numeric,p_unit_purchase_price numeric default null) returns uuid language plpgsql security definer set search_path=public as $$ declare v_order public.purchase_orders%rowtype; v_material public.materials%rowtype; v_supplier_relation public.material_suppliers%rowtype; v_price numeric; v_id uuid; begin select * into v_order from public.purchase_orders where id=p_purchase_order_id; if not found or (not public.is_platform_superadmin() and v_order.company_id is distinct from public.current_company_id()) or v_order.status<>'draft' then raise exception 'pedido de compra: línea no editable'; end if; if not public.has_permission('purchase_orders.update') then raise exception 'permiso: no puedes gestionar pedidos de compra'; end if; if p_ordered_quantity is null or p_ordered_quantity<=0 or p_unit_purchase_price is not null and p_unit_purchase_price<0 then raise exception 'validacion del formulario: cantidad/precio no válidos'; end if; select * into v_material from public.materials where id=p_material_id and company_id=v_order.company_id and active and deleted_at is null; if not found then raise exception 'empresa: material no válido para la empresa'; end if; if p_material_supplier_id is not null then select * into v_supplier_relation from public.material_suppliers where id=p_material_supplier_id and company_id=v_order.company_id and material_id=p_material_id and supplier_id=v_order.supplier_id and active; if not found then raise exception 'empresa: relación material-proveedor no válida para el pedido'; end if; end if; v_price:=coalesce(p_unit_purchase_price,v_supplier_relation.purchase_unit_price); insert into public.purchase_order_lines(company_id,purchase_order_id,material_id,material_supplier_id,material_description_snapshot,supplier_reference_snapshot,unit_snapshot,ordered_quantity,unit_purchase_price) values(v_order.company_id,p_purchase_order_id,p_material_id,p_material_supplier_id,v_material.description,v_supplier_relation.supplier_reference,v_material.unit,p_ordered_quantity,v_price) returning id into v_id; return v_id; end; $$;
 create or replace function public.dmp_update_purchase_order_line(p_line_id uuid,p_material_id uuid,p_material_supplier_id uuid,p_ordered_quantity numeric,p_unit_purchase_price numeric default null) returns uuid language plpgsql security definer set search_path=public as $$ declare v_line public.purchase_order_lines%rowtype; v_order public.purchase_orders%rowtype; v_material public.materials%rowtype; v_supplier_relation public.material_suppliers%rowtype; v_price numeric; begin if p_ordered_quantity is null or p_ordered_quantity<=0 or p_unit_purchase_price is not null and p_unit_purchase_price<0 then raise exception 'validacion del formulario: cantidad/precio no válidos'; end if; select * into v_line from public.purchase_order_lines where id=p_line_id; select * into v_order from public.purchase_orders where id=v_line.purchase_order_id; if not found or (not public.is_platform_superadmin() and v_order.company_id is distinct from public.current_company_id()) or v_order.status<>'draft' then raise exception 'pedido de compra: línea no editable'; end if; if not public.has_permission('purchase_orders.update') then raise exception 'permiso: no puedes gestionar pedidos de compra'; end if; select * into v_material from public.materials where id=p_material_id and company_id=v_order.company_id and active and deleted_at is null; if not found then raise exception 'empresa: material no válido para la empresa'; end if; if p_material_supplier_id is not null then select * into v_supplier_relation from public.material_suppliers where id=p_material_supplier_id and company_id=v_order.company_id and material_id=p_material_id and supplier_id=v_order.supplier_id and active; if not found then raise exception 'empresa: relación material-proveedor no válida para el pedido'; end if; end if; v_price:=coalesce(p_unit_purchase_price,v_supplier_relation.purchase_unit_price); update public.purchase_order_lines set material_id=p_material_id,material_supplier_id=p_material_supplier_id,material_description_snapshot=v_material.description,supplier_reference_snapshot=v_supplier_relation.supplier_reference,unit_snapshot=v_material.unit,ordered_quantity=p_ordered_quantity,unit_purchase_price=v_price,updated_at=now() where id=p_line_id; return p_line_id; end; $$;
create or replace function public.dmp_remove_purchase_order_line(p_line_id uuid) returns void language plpgsql security definer set search_path=public as $$ begin if not public.has_permission('purchase_orders.update') then raise exception 'permiso: no puedes gestionar pedidos de compra'; end if; if not exists(select 1 from public.purchase_order_lines pol join public.purchase_orders po on po.id=pol.purchase_order_id where pol.id=p_line_id and (public.is_platform_superadmin() or po.company_id=public.current_company_id()) and po.status='draft') then raise exception 'pedido de compra: línea no eliminable'; end if; delete from public.purchase_order_lines where id=p_line_id; end; $$;
create or replace function public.dmp_order_purchase_order(p_purchase_order_id uuid) returns uuid language plpgsql security definer set search_path=public as $$ begin if not public.has_permission('purchase_orders.submit') then raise exception 'permiso: no puedes gestionar pedidos de compra'; end if; if not exists(select 1 from public.purchase_orders where id=p_purchase_order_id and (public.is_platform_superadmin() or company_id=public.current_company_id()) and status='draft') then raise exception 'pedido de compra: solo un borrador puede marcarse como pedido'; end if; if not exists(select 1 from public.purchase_order_lines where purchase_order_id=p_purchase_order_id) or exists(select 1 from public.purchase_order_lines where purchase_order_id=p_purchase_order_id and unit_purchase_price is null) then raise exception 'pedido de compra: todas las líneas confirmadas necesitan precio acordado'; end if; update public.purchase_orders set status='ordered',updated_at=now() where id=p_purchase_order_id; return p_purchase_order_id; end; $$;
create or replace function public.dmp_cancel_purchase_order(p_purchase_order_id uuid) returns uuid language plpgsql security definer set search_path=public as $$ begin if not public.has_permission('purchase_orders.cancel') then raise exception 'permiso: no puedes gestionar pedidos de compra'; end if; if not exists(select 1 from public.purchase_orders where id=p_purchase_order_id and (public.is_platform_superadmin() or company_id=public.current_company_id()) and status in ('draft','ordered')) then raise exception 'pedido de compra: no se puede cancelar'; end if; update public.purchase_orders set status='cancelled',cancelled_at=now(),updated_at=now() where id=p_purchase_order_id; return p_purchase_order_id; end; $$;

create or replace function public.dmp_create_purchase_receipt(p_purchase_order_id uuid,p_receipt_date date,p_warehouse_id uuid,p_supplier_document_reference text default null,p_notes text default null) returns uuid language plpgsql security definer set search_path=public as $$ declare v_order public.purchase_orders; v_id uuid; v_company uuid; begin if not public.has_permission('purchase_receipts.create') then raise exception 'permiso: no puedes gestionar recepciones'; end if; select * into v_order from public.purchase_orders where id=p_purchase_order_id for update; if not found or (not public.is_platform_superadmin() and v_order.company_id<>public.current_company_id()) or v_order.status not in ('ordered','partially_received') then raise exception 'recepción: el pedido no está disponible para recibir'; end if; v_company:=v_order.company_id; if not exists(select 1 from public.warehouses where id=p_warehouse_id and company_id=v_company and active and deleted_at is null) then raise exception 'recepción: almacén no válido'; end if; insert into public.purchase_receipts(company_id,purchase_order_id,code,receipt_date,warehouse_id,supplier_id,supplier_document_reference,notes,created_by) values(v_company,v_order.id,public.next_dmp_code(v_company,'purchase_receipts','REC',true,6),coalesce(p_receipt_date,current_date),p_warehouse_id,v_order.supplier_id,nullif(trim(p_supplier_document_reference),''),nullif(trim(p_notes),''),public.current_profile_id()) returning id into v_id; return v_id; end; $$;
create or replace function public.dmp_update_purchase_receipt(p_receipt_id uuid,p_receipt_date date,p_warehouse_id uuid,p_supplier_document_reference text default null,p_notes text default null) returns uuid language plpgsql security definer set search_path=public as $$ declare v_receipt public.purchase_receipts; begin if not public.has_permission('purchase_receipts.update') then raise exception 'permiso: no puedes gestionar recepciones'; end if; select * into v_receipt from public.purchase_receipts where id=p_receipt_id for update; if not found or (not public.is_platform_superadmin() and v_receipt.company_id<>public.current_company_id()) or v_receipt.status<>'draft' then raise exception 'recepción: borrador no disponible'; end if; if not exists(select 1 from public.warehouses where id=p_warehouse_id and company_id=v_receipt.company_id and active and deleted_at is null) then raise exception 'recepción: almacén no válido'; end if; update public.purchase_receipts set receipt_date=coalesce(p_receipt_date,receipt_date),warehouse_id=p_warehouse_id,supplier_document_reference=nullif(trim(p_supplier_document_reference),''),notes=nullif(trim(p_notes),'') where id=p_receipt_id; return p_receipt_id; end; $$;
create or replace function public.dmp_add_purchase_receipt_line(p_receipt_id uuid,p_purchase_order_line_id uuid,p_received_quantity numeric,p_actual_unit_cost numeric default null) returns uuid language plpgsql security definer set search_path=public as $$ declare v_receipt public.purchase_receipts; v_line public.purchase_order_lines; v_id uuid; begin if not public.has_permission('purchase_receipts.update') then raise exception 'permiso: no puedes gestionar recepciones'; end if; if p_received_quantity is null or p_received_quantity<=0 or p_actual_unit_cost is not null and p_actual_unit_cost<0 then raise exception 'recepción: cantidad/coste no válidos'; end if; select * into v_receipt from public.purchase_receipts where id=p_receipt_id for update; if not found or (not public.is_platform_superadmin() and v_receipt.company_id<>public.current_company_id()) or v_receipt.status<>'draft' then raise exception 'recepción: borrador no disponible'; end if; select * into v_line from public.purchase_order_lines where id=p_purchase_order_line_id and company_id=v_receipt.company_id; if not found or v_line.purchase_order_id<>v_receipt.purchase_order_id then raise exception 'recepción: línea no válida para el pedido'; end if; insert into public.purchase_receipt_lines(company_id,purchase_receipt_id,purchase_order_line_id,material_id,description_snapshot,unit_snapshot,supplier_reference_snapshot,received_quantity,actual_unit_cost) values(v_receipt.company_id,p_receipt_id,p_purchase_order_line_id,v_line.material_id,v_line.material_description_snapshot,v_line.unit_snapshot,v_line.supplier_reference_snapshot,p_received_quantity,coalesce(p_actual_unit_cost,v_line.unit_purchase_price)) returning id into v_id; return v_id; end; $$;
create or replace function public.dmp_update_purchase_receipt_line(p_receipt_line_id uuid,p_received_quantity numeric,p_actual_unit_cost numeric default null) returns uuid language plpgsql security definer set search_path=public as $$ declare v_line public.purchase_receipt_lines; begin if not public.has_permission('purchase_receipts.update') then raise exception 'permiso: no puedes gestionar recepciones'; end if; if p_received_quantity is null or p_received_quantity<=0 or p_actual_unit_cost is not null and p_actual_unit_cost<0 then raise exception 'recepción: cantidad/coste no válidos'; end if; select * into v_line from public.purchase_receipt_lines where id=p_receipt_line_id; if not found or (not public.is_platform_superadmin() and v_line.company_id<>public.current_company_id()) then raise exception 'recepción: línea no disponible'; end if; update public.purchase_receipt_lines set received_quantity=p_received_quantity,actual_unit_cost=coalesce(p_actual_unit_cost,actual_unit_cost) where id=p_receipt_line_id; return p_receipt_line_id; end; $$;
create or replace function public.dmp_remove_purchase_receipt_line(p_receipt_line_id uuid) returns void language plpgsql security definer set search_path=public as $$ begin if not public.has_permission('purchase_receipts.update') then raise exception 'permiso: no puedes gestionar recepciones'; end if; if not exists(select 1 from public.purchase_receipt_lines prl join public.purchase_receipts pr on pr.id=prl.purchase_receipt_id where prl.id=p_receipt_line_id and pr.status='draft' and (public.is_platform_superadmin() or pr.company_id=public.current_company_id())) then raise exception 'recepción: línea no eliminable'; end if; delete from public.purchase_receipt_lines where id=p_receipt_line_id; end; $$;
create or replace function public.dmp_confirm_purchase_receipt(p_receipt_id uuid) returns uuid language plpgsql security definer set search_path=public as $$ declare v_receipt public.purchase_receipts; v_order public.purchase_orders; v_line public.purchase_receipt_lines; v_movement public.stock_movements; v_received numeric; v_key text; v_ordered numeric; begin if not public.has_permission('purchase_receipts.confirm') then raise exception 'permiso: no puedes confirmar recepciones'; end if; select * into v_receipt from public.purchase_receipts where id=p_receipt_id for update; if not found or (not public.is_platform_superadmin() and v_receipt.company_id<>public.current_company_id()) then raise exception 'recepción: no disponible'; end if; if v_receipt.status='confirmed' then return p_receipt_id; end if; if v_receipt.status<>'draft' then raise exception 'recepción: solo un borrador puede confirmarse'; end if; select * into v_order from public.purchase_orders where id=v_receipt.purchase_order_id for update; if not found or v_order.status not in ('ordered','partially_received') then raise exception 'recepción: el pedido no está disponible'; end if; if not exists(select 1 from public.purchase_receipt_lines where purchase_receipt_id=p_receipt_id) then raise exception 'recepción: añade al menos una línea'; end if; for v_line in select * from public.purchase_receipt_lines where purchase_receipt_id=p_receipt_id order by id loop if v_line.actual_unit_cost is null then raise exception 'recepción: todas las líneas necesitan coste real'; end if; select ordered_quantity into v_ordered from public.purchase_order_lines where id=v_line.purchase_order_line_id and company_id=v_receipt.company_id; select coalesce(sum(prl.received_quantity),0) into v_received from public.purchase_receipt_lines prl join public.purchase_receipts pr on pr.id=prl.purchase_receipt_id where prl.purchase_order_line_id=v_line.purchase_order_line_id and pr.status='confirmed' and prl.id<>v_line.id; if v_received+v_line.received_quantity>v_ordered then raise exception 'recepción: la cantidad supera la cantidad pendiente'; end if; v_key:='purchase-receipt-line:'||v_line.id; perform public.dmp_adjust_warehouse_stock(v_receipt.warehouse_id,v_line.material_id,'Entrada',v_line.received_quantity,'Recepción '||v_receipt.code,v_key); select * into v_movement from public.stock_movements where company_id=v_receipt.company_id and idempotency_key=v_key for update; if v_movement.id is null then raise exception 'recepción: no se creó el movimiento canónico'; end if; update public.stock_movements set supplier_id=v_receipt.supplier_id,purchase_order_id=v_receipt.purchase_order_id,purchase_order_line_id=v_line.purchase_order_line_id,purchase_receipt_id=v_receipt.id,purchase_receipt_line_id=v_line.id,unit_cost=v_line.actual_unit_cost,source='purchase_receipt',source_reference=v_receipt.supplier_document_reference,notes=coalesce(notes,'') where id=v_movement.id; end loop; update public.purchase_receipts set status='confirmed',confirmed_at=now() where id=p_receipt_id; if exists(select 1 from public.purchase_order_lines pol where pol.purchase_order_id=v_order.id and coalesce((select sum(prl.received_quantity) from public.purchase_receipt_lines prl join public.purchase_receipts pr on pr.id=prl.purchase_receipt_id where prl.purchase_order_line_id=pol.id and pr.status='confirmed'),0)<pol.ordered_quantity) then update public.purchase_orders set status='partially_received',updated_at=now() where id=v_order.id; else update public.purchase_orders set status='received',updated_at=now() where id=v_order.id; end if; return p_receipt_id; end; $$;
create or replace function public.dmp_cancel_draft_purchase_receipt(p_receipt_id uuid) returns uuid language plpgsql security definer set search_path=public as $$ begin if not public.has_permission('purchase_receipts.cancel') then raise exception 'permiso: no puedes cancelar recepciones'; end if; if not exists(select 1 from public.purchase_receipts where id=p_receipt_id and status='draft' and (public.is_platform_superadmin() or company_id=public.current_company_id())) then raise exception 'recepción: solo se puede cancelar un borrador'; end if; update public.purchase_receipts set status='cancelled' where id=p_receipt_id; return p_receipt_id; end; $$;

drop policy if exists purchase_orders_select_backoffice on public.purchase_orders;
drop policy if exists purchase_orders_insert_backoffice on public.purchase_orders;
drop policy if exists purchase_orders_update_backoffice on public.purchase_orders;
drop policy if exists purchase_order_lines_select_backoffice on public.purchase_order_lines;
drop policy if exists purchase_order_lines_insert_backoffice on public.purchase_order_lines;
drop policy if exists purchase_order_lines_update_backoffice on public.purchase_order_lines;
create policy purchase_orders_select_backoffice on public.purchase_orders for select to authenticated using ((public.is_platform_superadmin() or company_id = public.current_company_id()) and public.has_permission('purchase_orders.read'));
create policy purchase_orders_insert_backoffice on public.purchase_orders for insert to authenticated with check ((public.is_platform_superadmin() or company_id = public.current_company_id()) and public.has_permission('purchase_orders.create'));
create policy purchase_orders_update_backoffice on public.purchase_orders for update to authenticated using ((public.is_platform_superadmin() or company_id = public.current_company_id()) and public.has_permission('purchase_orders.update')) with check ((public.is_platform_superadmin() or company_id = public.current_company_id()) and public.has_permission('purchase_orders.update'));
create policy purchase_order_lines_select_backoffice on public.purchase_order_lines for select to authenticated using ((public.is_platform_superadmin() or company_id = public.current_company_id()) and public.has_permission('purchase_orders.read'));
create policy purchase_order_lines_insert_backoffice on public.purchase_order_lines for insert to authenticated with check ((public.is_platform_superadmin() or company_id = public.current_company_id()) and public.has_permission('purchase_orders.update'));
create policy purchase_order_lines_update_backoffice on public.purchase_order_lines for update to authenticated using ((public.is_platform_superadmin() or company_id = public.current_company_id()) and public.has_permission('purchase_orders.update')) with check ((public.is_platform_superadmin() or company_id = public.current_company_id()) and public.has_permission('purchase_orders.update'));

drop policy if exists purchase_receipts_select_backoffice on public.purchase_receipts;
drop policy if exists purchase_receipt_lines_select_backoffice on public.purchase_receipt_lines;
create policy purchase_receipts_select_backoffice on public.purchase_receipts for select to authenticated using ((public.is_platform_superadmin() or company_id = public.current_company_id()) and public.has_permission('purchase_receipts.read'));
create policy purchase_receipt_lines_select_backoffice on public.purchase_receipt_lines for select to authenticated using ((public.is_platform_superadmin() or company_id = public.current_company_id()) and public.has_permission('purchase_receipts.read'));

drop policy if exists suppliers_select_backoffice on public.suppliers;
drop policy if exists suppliers_insert_backoffice on public.suppliers;
drop policy if exists suppliers_update_backoffice on public.suppliers;
create policy suppliers_select_backoffice on public.suppliers for select to authenticated using ((public.is_platform_superadmin() or company_id = public.current_company_id()) and public.has_permission('suppliers.read') and deleted_at is null);
create policy suppliers_insert_backoffice on public.suppliers for insert to authenticated with check ((public.is_platform_superadmin() or company_id = public.current_company_id()) and public.has_permission('suppliers.create'));
create policy suppliers_update_backoffice on public.suppliers for update to authenticated using ((public.is_platform_superadmin() or company_id = public.current_company_id()) and public.has_permission('suppliers.update')) with check ((public.is_platform_superadmin() or company_id = public.current_company_id()) and public.has_permission('suppliers.update'));
drop policy if exists material_suppliers_select_backoffice on public.material_suppliers;
drop policy if exists material_suppliers_insert_backoffice on public.material_suppliers;
drop policy if exists material_suppliers_update_backoffice on public.material_suppliers;
create policy material_suppliers_select_backoffice on public.material_suppliers for select to authenticated using ((public.is_platform_superadmin() or company_id = public.current_company_id()) and public.has_permission('suppliers.read'));
create policy material_suppliers_insert_backoffice on public.material_suppliers for insert to authenticated with check ((public.is_platform_superadmin() or company_id = public.current_company_id()) and public.has_permission('suppliers.update'));
create policy material_suppliers_update_backoffice on public.material_suppliers for update to authenticated using ((public.is_platform_superadmin() or company_id = public.current_company_id()) and public.has_permission('suppliers.update')) with check ((public.is_platform_superadmin() or company_id = public.current_company_id()) and public.has_permission('suppliers.update'));
drop policy if exists materials_select_backoffice on public.materials;
drop policy if exists materials_write_backoffice on public.materials;
drop policy if exists materials_update_stock_backoffice on public.materials;
create policy materials_select_backoffice on public.materials for select to authenticated using ((public.is_platform_superadmin() or company_id = public.current_company_id()) and public.has_permission('materials.read'));
create policy materials_write_backoffice on public.materials for insert to authenticated with check ((public.is_platform_superadmin() or company_id = public.current_company_id()) and public.has_permission('materials.create'));
create policy materials_update_stock_backoffice on public.materials for update to authenticated using ((public.is_platform_superadmin() or company_id = public.current_company_id()) and public.has_permission('materials.update')) with check ((public.is_platform_superadmin() or company_id = public.current_company_id()) and public.has_permission('materials.update'));
drop policy if exists warehouse_stock_select_backoffice on public.warehouse_stock;
create policy warehouse_stock_select_backoffice on public.warehouse_stock for select to authenticated using ((public.is_platform_superadmin() or company_id = public.current_company_id()) and public.has_permission('stock.read'));

commit;
