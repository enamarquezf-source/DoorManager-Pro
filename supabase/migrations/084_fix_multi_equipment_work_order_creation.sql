-- DoorManager Pro - publica de forma segura la RPC 082 en PostgREST.
-- La causa corregida es PGRST202/schema cache stale tras reemplazar la funcion.
begin;

do $$
begin
  if to_regprocedure('public.create_work_order_full(jsonb)') is null then
    raise exception 'La RPC create_work_order_full(jsonb) no existe. Revisa la aplicacion de 082 antes de continuar.';
  end if;
  if to_regclass('public.work_order_equipment') is null then
    raise exception 'La tabla work_order_equipment no existe. Revisa la aplicacion de 082 antes de continuar.';
  end if;
  if to_regclass('public.equipment') is null or to_regclass('public.checks') is null then
    raise exception 'Faltan tablas base para crear partes multiequipo.';
  end if;
end;
$$;

-- PostgREST puede conservar la firma anterior en schema cache después de DDL.
notify pgrst, 'reload schema';

commit;
