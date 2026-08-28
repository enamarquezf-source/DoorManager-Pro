-- DoorManager Pro - expone una RPC estable para PostgREST sin duplicar la lógica 082.
begin;

create or replace function public.dmp_create_work_order_full(p_payload jsonb)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.create_work_order_full(p_payload);
$$;

grant execute on function public.dmp_create_work_order_full(jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
