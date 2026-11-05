begin;

-- Adjust only the payroll example in the installed demo seed.
do $$
declare
  definition text := pg_get_functiondef('public.dmp_demo_seed_business(uuid,text)'::regprocedure);
  old_costs text := '''employer_contributions'',600,''other_employer_costs'',0,''gross_amount'',2000,''net_amount'',1800,''employer_cost'',2600';
  new_costs text := '''employer_contributions'',500,''other_employer_costs'',0,''gross_amount'',2000,''net_amount'',1800,''employer_cost'',2500';
begin
  if strpos(definition, old_costs) > 0 then
    execute replace(definition, old_costs, new_costs);
  elsif strpos(definition, new_costs) = 0 then
    raise exception 'La nómina de ejemplo no coincide con la versión esperada del escenario de Gerencia';
  end if;
end;
$$;

update public.employee_hr_records record
set payload = record.payload || jsonb_build_object('employer_contributions', 500, 'employer_cost', 2500)
where record.kind = 'payroll'
  and record.payload->>'mode' = 'simulation'
  and record.payload->>'employer_contributions' = '600'
  and record.payload->>'employer_cost' = '2600'
  and record.payload->>'notes' = 'Importes ficticios para estudios; no es una nómina oficial'
  and exists (select 1 from public.dmp_demo_sessions session where session.company_id = record.company_id);

commit;
