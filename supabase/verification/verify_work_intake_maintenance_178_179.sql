-- Comprobación de solo lectura tras aplicar 178 y 179.
-- Todas las filas deben devolver ok = true.
select name, to_regclass('public.' || name) is not null as ok
from (values ('work_intake_receipts'), ('maintenance_contracts'),
 ('maintenance_contract_equipment'), ('maintenance_visits'),
 ('maintenance_operation_receipts')) as required(name);

select signature, to_regprocedure('public.' || signature) is not null as ok
from (values ('dmp_create_work_order_full(jsonb)'),
 ('dmp_attach_work_equipment(uuid,uuid,jsonb)'),
 ('dmp_update_work_intake(uuid,jsonb)'),
 ('dmp_save_maintenance_contract(uuid,jsonb)'),
 ('dmp_generate_maintenance_visit(uuid)'),
 ('dmp_generate_maintenance_plan(uuid)'),
 ('dmp_change_maintenance_contract(uuid,text)'),
 ('dmp_change_maintenance_visit(uuid,date,text)'),
 ('dmp_set_maintenance_equipment(uuid,uuid,jsonb)')) as required(signature);

select name, coalesce(c.relrowsecurity, false) as ok
from (values ('work_intake_receipts'), ('maintenance_contracts'),
 ('maintenance_contract_equipment'), ('maintenance_visits'),
 ('maintenance_operation_receipts')) as required(name)
left join pg_class c on c.oid = to_regclass('public.' || name);

select signature,
 not coalesce(has_function_privilege('authenticated',
 to_regprocedure('public.' || signature), 'EXECUTE'), true) as ok
from (values ('dmp_resolve_equipment_selection(uuid,uuid,uuid,jsonb)'),
 ('dmp_work_intake_legacy_create(jsonb)')) as private_functions(signature);
