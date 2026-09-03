begin;

do $$
declare
  v_deleted bigint;
begin
  if to_regclass('public.material_stock_movements') is null then
    raise exception 'pre-110 cleanup: falta public.material_stock_movements';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prokind in ('f', 'p')
      and (
        position('insert into public.material_stock_movements' in lower(pg_get_functiondef(p.oid))) > 0
        or position('update public.material_stock_movements' in lower(pg_get_functiondef(p.oid))) > 0
      )
  ) then
    raise exception 'pre-110 cleanup: existe un escritor runtime INSERT/UPDATE sobre material_stock_movements';
  end if;

  if to_regclass('public.warehouse_stock') is null then
    raise exception 'pre-110 cleanup: falta public.warehouse_stock';
  end if;
  if to_regclass('public.stock_movements') is null then
    raise exception 'pre-110 cleanup: falta public.stock_movements';
  end if;
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'materials'
      and column_name = 'stock_quantity'
  ) then
    raise exception 'pre-110 cleanup: materials.stock_quantity aun existe';
  end if;

  delete from public.material_stock_movements;
  get diagnostics v_deleted = row_count;
  raise notice 'pre-110 cleanup: filas eliminadas de material_stock_movements=%', v_deleted;
end;
$$;

commit;
