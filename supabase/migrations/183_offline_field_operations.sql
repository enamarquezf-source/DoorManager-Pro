-- Atomic receipts make retries safe even if the response was lost after commit.
begin;
create table if not exists public.field_operation_receipts (
 operation_id text primary key,
 company_id uuid not null references public.companies(id),
 profile_id uuid not null references public.profiles(id),
 work_order_id uuid not null references public.work_orders(id),
 kind text not null,
 payload jsonb not null,
 result_id text,
 created_at timestamptz not null default now()
);
alter table public.field_operation_receipts enable row level security;
revoke all on public.field_operation_receipts from public, anon, authenticated;

create or replace function public.dmp_sync_field_operation(p_operation_id text, p_kind text, p_work_order_id uuid, p_check_id uuid, p_payload jsonb)
returns text language plpgsql security definer set search_path=public as $$
declare
 v_actor uuid:=public.current_profile_id(); v_work public.work_orders;
 v_receipt public.field_operation_receipts; v_result text; v_updated timestamptz; v_entry uuid;
 v_decision text; v_usage uuid;
 v_payload jsonb:=p_payload - 'localChangeId' - 'expected_updated_at' - 'expected_work_performed';
begin
 if not exists(select 1 from public.profiles where id=v_actor and active and deleted_at is null) then raise exception 'offline: Perfil desactivado';end if;
 if v_actor is null then raise exception 'offline: Inicia sesión para enviar el trabajo'; end if;
 if p_operation_id is null or length(p_operation_id)<8 or length(p_operation_id)>240 then raise exception 'offline: Identificador de operación no válido';end if;
 if p_kind not in ('time','cost','material-entry','work-fields','check-finish','work-finish','concept-decision','planned-material') then raise exception 'offline: Operación no permitida';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'offline: Datos de operación no válidos';end if;
 -- Serialize identical retries, including operations on different work orders.
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));
 select * into v_work from public.work_orders where id=p_work_order_id and deleted_at is null for update;
 if not found then raise exception 'offline: Parte no disponible';end if;
 perform public.assert_member_of_current_company(v_work.company_id);
 select * into v_receipt from public.field_operation_receipts where operation_id=p_operation_id;
 if found then
  if v_receipt.profile_id<>v_actor or v_receipt.company_id<>v_work.company_id or v_receipt.work_order_id<>v_work.id or v_receipt.kind<>p_kind or v_receipt.payload is distinct from jsonb_build_object('values',p_payload,'check_id',p_check_id) then raise exception 'offline: El identificador ya corresponde a otra operación';end if;
  return v_receipt.result_id;
 end if;
 if not coalesce((public.has_any_role(array['superadmin','SAT','Gerencia']) or public.is_assigned_to_work_order(v_work.id,v_actor) or (p_kind='check-finish' and exists(select 1 from public.checks where id=p_check_id and work_order_id=v_work.id and company_id=v_work.company_id and technician_id=v_actor and deleted_at is null))),false) then raise exception 'offline: La asignación ha cambiado. Solicita revisión a SAT; el trabajo sigue en el dispositivo';end if;
 if p_kind<>'check-finish' and v_work.status in ('Cerrado','Cancelado','Finalizado tecnicamente','Facturado') then raise exception 'offline: El estado del parte ha cambiado. Requiere revisión de SAT';end if;
 if p_kind in ('time','cost','material-entry') then
  v_payload:=v_payload||jsonb_build_object('work_order_id',v_work.id);
  v_entry:=nullif(p_payload->>'id','')::uuid;
  if v_entry is not null then
   if p_kind='time' then select updated_at into v_updated from public.work_order_time_entries where id=v_entry and work_order_id=v_work.id and company_id=v_work.company_id for update;
   elsif p_kind='cost' then select updated_at into v_updated from public.work_order_cost_entries where id=v_entry and work_order_id=v_work.id and company_id=v_work.company_id and deleted_at is null for update;
   else select updated_at into v_updated from public.work_order_materials where id=v_entry and work_order_id=v_work.id and company_id=v_work.company_id and deleted_at is null for update;end if;
   if not found or v_updated is distinct from nullif(p_payload->>'expected_updated_at','')::timestamptz then raise exception 'offline: Este registro ha cambiado desde la descarga. Requiere revisión antes de sobrescribir';end if;
  end if;
  if p_kind='time' then v_result:=public.dmp_upsert_work_order_time_entry(v_payload)::text;
  elsif p_kind='cost' then v_result:=public.dmp_upsert_work_order_cost_entry(v_payload)::text;
  else v_result:=public.dmp_submit_work_order_material(v_payload||jsonb_build_object('local_change_id',p_operation_id))::text;end if;
 elsif p_kind='planned-material' then
  select decision into v_decision from public.work_order_planned_material_decisions where work_order_id=v_work.id and quote_line_id=(p_payload->>'quote_line_id')::uuid and deleted_at is null for update;
  if v_decision is distinct from (p_payload->>'expected_decision') then raise exception 'offline: El material previsto ha cambiado desde la descarga. Requiere revisión';end if;
  v_payload:=(v_payload-'expected_decision')||jsonb_build_object('work_order_id',v_work.id);
  if p_payload->>'decision'='utilizado' then
   v_usage:=public.dmp_submit_work_order_material(v_payload||jsonb_build_object('local_change_id',p_operation_id));
   v_payload:=v_payload||jsonb_build_object('work_order_material_id',v_usage);
  end if;
  v_result:=public.dmp_set_work_order_planned_material_decision(v_payload)::text;
 elsif p_kind='concept-decision' then
  select decision into v_decision from public.work_order_quote_line_decisions where work_order_id=v_work.id and quote_line_id=(p_payload->>'quote_line_id')::uuid and deleted_at is null for update;
  if v_decision is distinct from (p_payload->>'expected_decision') then raise exception 'offline: El concepto ha cambiado desde la descarga. Requiere revisión';end if;
  v_result:=public.dmp_resolve_planned_concept_technical((v_payload-'expected_decision')||jsonb_build_object('work_order_id',v_work.id))::text;
 elsif p_kind='work-fields' then
  if coalesce(v_work.work_performed,'') is distinct from coalesce(p_payload->>'expected_work_performed','') then raise exception 'offline: El trabajo realizado ha cambiado en el servidor. Requiere revisión antes de sobrescribir';end if;
  update public.work_orders set work_performed=p_payload->>'work_performed',updated_at=now() where id=v_work.id;
  v_result:=v_work.id::text;
 elsif p_kind='check-finish' then
  if not exists(select 1 from public.checks where id=p_check_id and work_order_id=v_work.id and company_id=v_work.company_id and deleted_at is null) then raise exception 'offline: El check no pertenece a este parte';end if;
  perform public.finish_check_safe(p_check_id,nullif(p_payload->>'observations',''));
  v_result:=p_check_id::text;
 else
  perform public.dmp_finalize_work_order_technical(v_work.id,v_payload);
  v_result:=v_work.id::text;
 end if;
 insert into public.field_operation_receipts(operation_id,company_id,profile_id,work_order_id,kind,payload,result_id)
 values(p_operation_id,v_work.company_id,v_actor,v_work.id,p_kind,jsonb_build_object('values',p_payload,'check_id',p_check_id),v_result);
 return v_result;
end;
$$;
revoke all on function public.dmp_sync_field_operation(text,text,uuid,uuid,jsonb) from public,anon;
grant execute on function public.dmp_sync_field_operation(text,text,uuid,uuid,jsonb) to authenticated;

-- Section-level optimistic concurrency: two technicians can edit different
-- sections, but cannot silently overwrite the same downloaded section.
create or replace function public.dmp_save_check_block_offline(p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_check public.checks; v_section public.check_section_results; v_actor uuid:=public.current_profile_id();
begin
 if not exists(select 1 from public.profiles where id=v_actor and active and deleted_at is null) then raise exception 'offline: Perfil desactivado';end if;
 select * into v_check from public.checks where id=(p_payload->>'check_id')::uuid and deleted_at is null for update;
 if not found then raise exception 'offline: Check no disponible';end if;
 perform public.assert_member_of_current_company(v_check.company_id);
 if not coalesce((public.has_any_role(array['superadmin','SAT','Gerencia']) or v_check.technician_id=v_actor or public.is_assigned_to_work_order(v_check.work_order_id,v_actor)),false) then raise exception 'offline: Sin permiso para guardar este check';end if;
 select * into v_section from public.check_section_results where check_id=v_check.id and section_id=(p_payload->>'section_id')::uuid for update;
 if found and v_section.local_change_id=p_payload->>'local_change_id' then return v_section.id;end if;
 if v_section.updated_at is distinct from nullif(p_payload->>'expected_section_updated_at','')::timestamptz then raise exception 'offline: Otro usuario ha cambiado este bloque desde la descarga. Requiere revisión antes de sobrescribir';end if;
 return public.save_check_block_result(p_payload);
end;
$$;
revoke all on function public.dmp_save_check_block_offline(jsonb) from public,anon;
grant execute on function public.dmp_save_check_block_offline(jsonb) to authenticated;
commit;
