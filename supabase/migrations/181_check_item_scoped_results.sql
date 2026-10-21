-- A section result is a summary. Individual defects belong only to selected items.
begin;
alter table public.check_section_results add column if not exists affected_item_ids uuid[] not null default '{}';

create or replace function public.save_check_block_result(p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare
 v_check public.checks; v_section uuid:=(p_payload->>'section_id')::uuid;
 v_section_result uuid; v_item record; v_input jsonb; v_reference text; v_matches uuid[];
 v_selected uuid[]:='{}'; v_item_id uuid; v_result text:=p_payload->>'result';
 v_item_result text; v_notes text; v_summary text:=nullif(btrim(p_payload->>'observations'),'');
 v_intervention text:=nullif(btrim(p_payload->>'intervention'),''); v_severity text:=nullif(p_payload->>'severity','');
 v_problem boolean:=v_result in('Problema leve','No favorable','Favorable tras intervencion');
 v_explicit boolean:=coalesce(p_payload->>'item_results_version','0')='1';
 v_remaining boolean:=coalesce((p_payload->>'remaining_favorable')::boolean,false);
 v_components jsonb; v_count integer; v_rows jsonb:='[]';
begin
 select * into v_check from public.checks where id=(p_payload->>'check_id')::uuid and deleted_at is null for update;
 if not found then raise exception 'check: Check no encontrado';end if;
 perform public.assert_member_of_current_company(v_check.company_id);
 if not coalesce((public.has_any_role(array['superadmin','SAT','Gerencia']) or v_check.technician_id=public.current_profile_id() or public.is_assigned_to_work_order(v_check.work_order_id)),false) then raise exception 'check: No tienes permisos para guardar este check';end if;
 if not exists(select 1 from public.check_template_sections s join public.check_templates t on t.id=s.template_id where s.id=v_section and s.template_id=v_check.template_id and (t.company_id=v_check.company_id or t.company_id is null)) then raise exception 'check: La sección no pertenece a la plantilla asociada al check';end if;
 if v_result is null or v_result not in('Todo favorable','Problema leve','No favorable','Favorable tras intervencion','No aplicable') then raise exception 'check: Selecciona un resultado válido';end if;
 if v_severity is not null and v_severity not in('Leve','Media','Alta','Critica') then raise exception 'check: Gravedad no válida';end if;
 select count(*) into v_count from public.check_template_items where section_id=v_section;
 if v_explicit then
  if jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items')<>v_count then raise exception 'check: Revisa los resultados individuales de esta sección';end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'items') x left join public.check_template_items t on t.id=(x->>'id')::uuid and t.section_id=v_section where t.id is null) or (select count(distinct x->>'id') from jsonb_array_elements(p_payload->'items') x)<>v_count then raise exception 'check: Hay elementos duplicados o de otra sección';end if;
  if jsonb_typeof(p_payload->'selected_item_ids') is distinct from 'array' then raise exception 'check: Selecciona los elementos afectados';end if;
  select coalesce(array_agg(distinct value::uuid),'{}') into v_selected from jsonb_array_elements_text(p_payload->'selected_item_ids');
 else
  -- Older offline clients sent component labels. Resolve only unambiguous labels.
  if jsonb_typeof(coalesce(p_payload->'components','[]')) is distinct from 'array' then raise exception 'check: Selección de componentes no válida';end if;
  if v_problem then
   for v_reference in select value from jsonb_array_elements_text(coalesce(p_payload->'components','[]')) loop
    select array_agg(id) into v_matches from public.check_template_items where section_id=v_section and (id::text=v_reference or coalesce(nullif(component,''),title)=v_reference);
    if coalesce(cardinality(v_matches),0)<>1 then raise exception 'check: Abre el bloque y selecciona el elemento afectado; su referencia anterior es ambigua';end if;
    v_selected:=array_append(v_selected,v_matches[1]);
   end loop;
  end if;
 end if;
 if exists(select 1 from unnest(v_selected) id where not exists(select 1 from public.check_template_items t where t.id=id and t.section_id=v_section)) then raise exception 'check: El elemento seleccionado pertenece a otra sección';end if;
 if not v_problem then v_selected:='{}';end if;
 if v_problem and v_count>0 and cardinality(v_selected)=0 then raise exception 'check: Selecciona al menos un elemento con incidencia';end if;
 if v_problem and v_count=0 and v_summary is null then raise exception 'check: Describe la incidencia de esta zona';end if;
 for v_item in select * from public.check_template_items where section_id=v_section order by position,id loop
  v_item_result:=case when not v_problem then v_result when v_item.id=any(v_selected) then v_result when v_remaining then 'Todo favorable' else 'Sin revisar' end;
  v_notes:=null;
  if v_item.id=any(v_selected) then
   if v_explicit then select x into v_input from jsonb_array_elements(p_payload->'items') x where x->>'id'=v_item.id::text; v_notes:=nullif(btrim(v_input->>'observations'),'');end if;
   v_notes:=coalesce(v_notes,v_summary);
   if v_notes is null then raise exception 'check: Describe qué le ocurre a cada elemento seleccionado';end if;
  end if;
  if v_explicit then
   select x into v_input from jsonb_array_elements(p_payload->'items') x where x->>'id'=v_item.id::text;
   if v_input->>'result' is distinct from v_item_result then raise exception 'check: El resultado individual no coincide con la selección de elementos';end if;
  end if;
  v_rows:=v_rows||jsonb_build_array(jsonb_build_object('id',v_item.id,'title',v_item.title,'result',v_item_result,'observations',v_notes));
 end loop;
 select coalesce(jsonb_agg(coalesce(nullif(component,''),title)),'[]') into v_components from public.check_template_items where id=any(v_selected);
 if v_summary is null and v_problem then select string_agg((x->>'title')||': '||(x->>'observations'),E'\n') into v_summary from jsonb_array_elements(v_rows) x where x->>'observations' is not null;end if;
 insert into public.check_section_results(company_id,check_id,section_id,result,observations,intervention,severity,components,affected_item_ids,local_change_id,synced_at)
 values(v_check.company_id,v_check.id,v_section,v_result,case when v_problem then v_summary end,case when v_problem then v_intervention end,case when v_problem then v_severity end,v_components,v_selected,nullif(p_payload->>'local_change_id',''),now())
 on conflict(check_id,section_id) do update set result=excluded.result,observations=excluded.observations,intervention=excluded.intervention,severity=excluded.severity,components=excluded.components,affected_item_ids=excluded.affected_item_ids,local_change_id=excluded.local_change_id,synced_at=now(),updated_at=now()
 returning id into v_section_result;
 for v_input in select value from jsonb_array_elements(v_rows) loop
  insert into public.check_item_results(company_id,check_id,section_result_id,item_id,result,observations)
  values(v_check.company_id,v_check.id,v_section_result,(v_input->>'id')::uuid,v_input->>'result',v_input->>'observations')
  on conflict(check_id,item_id) do update set section_result_id=excluded.section_result_id,result=excluded.result,observations=excluded.observations,updated_at=now();
 end loop;
 update public.checks set status=case when finished_at is null then 'En curso' else status end,
 global_result=case when exists(select 1 from public.check_section_results where check_id=v_check.id and result='No favorable') then 'No favorable' when exists(select 1 from public.check_section_results where check_id=v_check.id and result='Problema leve') then 'Problema leve' when exists(select 1 from public.check_section_results where check_id=v_check.id and result='Favorable tras intervencion') then 'Favorable tras intervencion' else v_result end,
 observations=coalesce(v_summary,observations),started_at=coalesce(started_at,now()),updated_at=now() where id=v_check.id;
 return v_section_result;
end;
$$;
revoke all on function public.save_check_block_result(jsonb) from public,anon;
grant execute on function public.save_check_block_result(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
