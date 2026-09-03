-- DoorManager Pro - remove the retired global material stock column.
-- The historical movement table remains available for audited cleanup paths.
begin;

do $$
declare
  v_definition text;
  v_before text;
begin
  if to_regprocedure('public.dmp_lifecycle_delete_plan(text,uuid)') is null then
    raise exception '108: falta dmp_lifecycle_delete_plan';
  end if;

  v_definition := pg_get_functiondef(to_regprocedure('public.dmp_lifecycle_delete_plan(text,uuid)'));
  v_before := v_definition;
  v_definition := regexp_replace(
    v_definition,
    E'case when coalesce\\(\\(select stock_quantity from public\\.materials where id = p_entity_id\\), 0\\) > 0 then 1 else 0 end',
    'case when coalesce((select sum(ws.quantity) from public.warehouse_stock ws where ws.material_id = p_entity_id), 0) > 0 then 1 else 0 end',
    'gi'
  );
  if v_definition = v_before then
    raise exception '108: no se encontró la expresión legacy de stock en dmp_lifecycle_delete_plan';
  end if;
  execute v_definition;

  if pg_get_functiondef(to_regprocedure('public.dmp_lifecycle_delete_plan(text,uuid)')) ~* 'stock_quantity' then
    raise exception '108: lifecycle delete plan todavía contiene stock_quantity';
  end if;
end;
$$;

do $$
declare
  v_definition text;
  v_before text;
begin
  if to_regprocedure('public.dmp_purge_entity_with_cleanup_legacy(text,uuid,text,text,jsonb,boolean,boolean)') is null then
    raise exception '108: falta dmp_purge_entity_with_cleanup_legacy';
  end if;

  v_definition := pg_get_functiondef(to_regprocedure('public.dmp_purge_entity_with_cleanup_legacy(text,uuid,text,text,jsonb,boolean,boolean)'));
  v_before := v_definition;
  v_definition := regexp_replace(
    v_definition,
    E'coalesce\\(v_material\\.stock_quantity, 0\\) > 0',
    'coalesce((select sum(ws.quantity) from public.warehouse_stock ws where ws.material_id = p_entity_id), 0) > 0',
    'gi'
  );
  v_definition := regexp_replace(v_definition, E'\\n\\s*update public\\.materials set stock_quantity = 0[^;]*;', '', 'gis');
  if v_definition = v_before then
    raise exception '108: no se encontró la expresión legacy de stock en purge legacy';
  end if;
  execute v_definition;

  if pg_get_functiondef(to_regprocedure('public.dmp_purge_entity_with_cleanup_legacy(text,uuid,text,text,jsonb,boolean,boolean)')) ~* 'stock_quantity' then
    raise exception '108: purge legacy todavía contiene stock_quantity';
  end if;
end;
$$;

-- These endpoints were retired by 107 and are removed explicitly, without CASCADE.
drop function if exists public.dmp_apply_material_stock_movement(uuid,text,numeric,text,text,uuid,uuid,uuid,numeric,uuid);
drop function if exists public.dmp_adjust_material_stock(uuid,text,numeric,text,numeric);

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'materials' and column_name = 'stock_quantity') then
    -- PostgreSQL removes a column default and column-owned CHECK automatically.
    alter table public.materials drop column stock_quantity;
  end if;
end;
$$;

commit;
