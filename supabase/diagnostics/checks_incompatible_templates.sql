-- Diagnostico de solo lectura: checks con plantilla incompatible con el tipo de equipo.
-- No corrige datos automaticamente.

select
  ch.id as check_id,
  ch.code as check_code,
  e.id as equipment_id,
  e.code as equipment_code,
  et.name as equipment_type,
  ct.id as template_id,
  ct.name as template_name,
  tt.name as template_equipment_type
from public.checks ch
join public.equipment e on e.id = ch.equipment_id
left join public.equipment_types et on et.id = e.equipment_type_id
join public.check_templates ct on ct.id = ch.template_id
left join public.equipment_types tt on tt.id = ct.equipment_type_id
where ch.deleted_at is null
  and e.deleted_at is null
  and ct.equipment_type_id is not null
  and ct.equipment_type_id <> e.equipment_type_id
order by ch.created_at desc;
