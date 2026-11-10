begin;

create table if not exists public.work_order_followups (
  origin_id uuid not null references public.work_orders(id) on delete cascade,
  followup_id uuid not null references public.work_orders(id) on delete cascade,
  company_id uuid not null references public.companies(id),
  kind text not null check (kind in ('continuacion', 'garantia')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (origin_id, followup_id),
  check (origin_id <> followup_id)
);
create unique index if not exists work_order_followups_pair
  on public.work_order_followups(least(origin_id, followup_id), greatest(origin_id, followup_id));
create index if not exists work_order_followups_target on public.work_order_followups(followup_id);
alter table public.work_order_followups enable row level security;
revoke all on public.work_order_followups from public, anon, authenticated;
grant select on public.work_order_followups to authenticated;
drop policy if exists work_order_followups_read on public.work_order_followups;
create policy work_order_followups_read on public.work_order_followups for select to authenticated
  using (public.has_any_role(array['SAT','Gerencia','Oficina','superadmin'])
    and (company_id = public.current_company_id() or public.is_platform_superadmin()));

create or replace function public.dmp_link_work_order_followup(p_origin_id uuid, p_followup_id uuid, p_kind text)
returns void language plpgsql security definer set search_path=public as $$
declare
  actor public.profiles := public.dmp024_active_profile();
  origin public.work_orders;
  followup public.work_orders;
begin
  if not coalesce(public.has_any_role(array['SAT','Gerencia','Oficina','superadmin']), false) then
    raise exception 'permiso: no puedes relacionar partes';
  end if;
  if p_origin_id = p_followup_id or p_kind is null or p_kind not in ('continuacion','garantia') then
    raise exception 'validacion del formulario: relación de partes no válida';
  end if;
  select * into origin from public.work_orders where id=p_origin_id and deleted_at is null;
  select * into followup from public.work_orders where id=p_followup_id and deleted_at is null;
  if origin.id is null or followup.id is null then raise exception 'parte: parte no disponible'; end if;
  perform public.assert_member_of_current_company(origin.company_id);
  if followup.company_id is distinct from origin.company_id or origin.client_id is null
    or followup.client_id is distinct from origin.client_id then
    raise exception 'empresa: ambos partes deben pertenecer al mismo cliente y empresa';
  end if;
  insert into public.work_order_followups(origin_id,followup_id,company_id,kind,created_by)
  values(origin.id,followup.id,origin.company_id,p_kind,actor.id)
  on conflict do nothing;
  if not found and not exists (
    select 1 from public.work_order_followups
    where origin_id=origin.id and followup_id=followup.id and kind=p_kind
  ) then raise exception 'validacion del formulario: estos partes ya tienen una relación registrada'; end if;
end $$;

create or replace function public.dmp_create_work_order_followup(p_origin_id uuid, p_kind text, p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  origin public.work_orders;
  target uuid;
  payload jsonb;
begin
  if not coalesce(public.has_any_role(array['SAT','Gerencia','superadmin']),false) then
    raise exception 'permiso: no puedes crear una continuación';
  end if;
  if p_kind is null or p_kind not in ('continuacion','garantia') or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'validacion del formulario: tipo de seguimiento no válido';
  end if;
  select * into origin from public.work_orders where id=p_origin_id and deleted_at is null;
  if not found then raise exception 'parte: parte de origen no disponible'; end if;
  perform public.assert_member_of_current_company(origin.company_id);
  if origin.client_id is null or nullif(p_payload->>'client_id','')::uuid is distinct from origin.client_id then
    raise exception 'empresa: la nueva intervención debe conservar el cliente del parte de origen';
  end if;

  payload := (p_payload - 'quote_id') || jsonb_build_object('company_id',origin.company_id,'_followup_origin_id',origin.id,'_followup_kind',p_kind);
  if p_kind='garantia' then payload:=payload || jsonb_build_object('type','Garantia'); end if;
  target := public.dmp_create_work_order_full(payload);
  if p_kind='garantia' and not exists (
    select 1 from public.work_order_followups where origin_id=origin.id and followup_id=target
  ) then
    update public.work_orders set warranty=true,billable=false where id=target and (not warranty or billable);
  end if;
  perform public.dmp_link_work_order_followup(origin.id,target,p_kind);
  return target;
end $$;

revoke all on function public.dmp_link_work_order_followup(uuid,uuid,text) from public,anon;
revoke all on function public.dmp_create_work_order_followup(uuid,text,jsonb) from public,anon;
grant execute on function public.dmp_link_work_order_followup(uuid,uuid,text) to authenticated;
grant execute on function public.dmp_create_work_order_followup(uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
