-- Solo lectura. Todas las comprobaciones deben devolver ok = true.
select expected.column_name, exists(
 select 1 from information_schema.columns c
 where c.table_schema='public' and c.table_name='check_section_results'
 and c.column_name=expected.column_name
) as ok
from (values ('affected_item_ids'),('favorable_item_ids')) expected(column_name);

select signature,to_regprocedure('public.'||signature) is not null as ok
from (values ('save_check_block_result(jsonb)'),('register_check_photo(jsonb)'),
 ('dmp_register_check_photo_legacy(jsonb)')) expected(signature);

select not coalesce(has_function_privilege('authenticated',
 to_regprocedure('public.dmp_register_check_photo_legacy(jsonb)'),'EXECUTE'),true) as ok;
