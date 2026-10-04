-- Align controlled material correction with Office work-order operations.
-- Preserve current company, actor, stock return and closed/invoiced guards.
begin;
do $$
declare v_definition text;
begin
  v_definition := pg_get_functiondef('public.dmp_delete_work_order_material(uuid,text)'::regprocedure);
  v_definition := replace(v_definition, 'array[''superadmin'',''SAT'',''Gerencia'']', 'array[''superadmin'',''SAT'',''Gerencia'',''Oficina'']');
  v_definition := replace(v_definition, 'array[''superadmin'', ''SAT'', ''Gerencia'']', 'array[''superadmin'', ''SAT'', ''Gerencia'', ''Oficina'']');
  execute v_definition;
end $$;
commit;
