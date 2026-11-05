begin;

create or replace function public.dmp_demo_technician_planned_lines(p_work_order_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  work public.work_orders;
begin
  work := public.dmp024_assert_work_order_operator(p_work_order_id, false);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', line.id,
      'description', line.description,
      'line_type', line.line_type,
      'quantity', line.quantity,
      'unit', line.unit,
      'material_id', line.material_id,
      'materials', case when material.id is not null
        then jsonb_build_object('stock_controlled', material.stock_controlled)
        else null end
    ) order by line.position, line.id)
    from public.quote_lines line
    left join public.materials material
      on material.id = line.material_id and material.company_id = work.company_id
    where line.quote_id = work.quote_id
      and line.company_id = work.company_id
      and line.deleted_at is null
      and line.line_type not in ('fee', 'discount', 'labor')
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.dmp_demo_technician_planned_lines(uuid) from public, anon;
grant execute on function public.dmp_demo_technician_planned_lines(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
