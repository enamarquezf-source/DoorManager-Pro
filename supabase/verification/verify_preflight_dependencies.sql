-- Verificacion de dependencias requeridas por 018_preflight, 018_rpc_reconcile, 019_audit y 020_check_sync.
-- Ejecutar despues de aplicar 018_preflight_reconcile_dependencies.sql y 018_rpc_reconcile_missing_frontend_functions.sql, antes de 019/020.

with required(function_name, required_signature, argument_types) as (
  values
    ('current_company_id', 'public.current_company_id()', ''),
    ('current_profile_id', 'public.current_profile_id()', ''),
    ('is_platform_superadmin', 'public.is_platform_superadmin()', ''),
    ('is_company_member', 'public.is_company_member(uuid)', 'uuid'),
    ('assert_member_of_current_company', 'public.assert_member_of_current_company(uuid)', 'uuid'),
    ('finish_check', 'public.finish_check(uuid, uuid, text, text)', 'uuid, uuid, text, text'),
    ('has_any_role', 'public.has_any_role(text[])', 'text[]'),
    ('is_assigned_to_work_order', 'public.is_assigned_to_work_order(uuid, uuid)', 'uuid, uuid'),
    ('next_dmp_code', 'public.next_dmp_code(uuid, text, text, boolean, integer)', 'uuid, text, text, boolean, integer'),
    ('create_case', 'public.create_case(uuid, uuid, uuid, text, text, text, text, text, text, uuid)', 'uuid, uuid, uuid, text, text, text, text, text, text, uuid'),
    ('create_work_order_full', 'public.create_work_order_full(jsonb)', 'jsonb'),
    ('save_check_block_result', 'public.save_check_block_result(jsonb)', 'jsonb'),
    ('unassign_work_order_profile', 'public.unassign_work_order_profile(uuid, uuid, uuid, text)', 'uuid, uuid, uuid, text'),
    ('assign_commercial_work_order', 'public.assign_commercial_work_order(uuid, uuid, uuid)', 'uuid, uuid, uuid'),
    ('superadmin_create_profile', 'public.superadmin_create_profile(jsonb)', 'jsonb'),
    ('technician_global_search', 'public.technician_global_search(text)', 'text'),
    ('normalize_profile_role_names', 'public.normalize_profile_role_names(text, text[])', 'text, text[]'),
    ('superadmin_update_profile', 'public.superadmin_update_profile(uuid, jsonb)', 'uuid, jsonb'),
    ('mark_alert_as_read', 'public.mark_alert_as_read(uuid, uuid)', 'uuid, uuid'),
    ('dmp_storage_company_id', 'public.dmp_storage_company_id(text)', 'text'),
    ('dmp_storage_resource_type', 'public.dmp_storage_resource_type(text)', 'text'),
    ('dmp_storage_resource_id', 'public.dmp_storage_resource_id(text)', 'text'),
    ('can_read_dmp_storage_object', 'public.can_read_dmp_storage_object(text)', 'text'),
    ('can_write_dmp_storage_object', 'public.can_write_dmp_storage_object(text)', 'text'),
    ('assert_dmp_storage_path', 'public.assert_dmp_storage_path(text, uuid, text, uuid)', 'text, uuid, text, uuid'),
    ('register_check_photo', 'public.register_check_photo(jsonb)', 'jsonb'),
    ('register_work_order_photo', 'public.register_work_order_photo(jsonb)', 'jsonb'),
    ('register_work_order_signature', 'public.register_work_order_signature(jsonb)', 'jsonb'),
    ('register_check_deficiency', 'public.register_check_deficiency(jsonb)', 'jsonb'),
    ('register_work_order_deficiency', 'public.register_work_order_deficiency(jsonb)', 'jsonb'),
    ('finish_check_safe', 'public.finish_check_safe(uuid, text)', 'uuid, text'),
    ('sync_work_order_note', 'public.sync_work_order_note(uuid, text, text)', 'uuid, text, text'),
    ('sync_work_order_material_usage', 'public.sync_work_order_material_usage(uuid, text, numeric, text)', 'uuid, text, numeric, text')
)
select
  r.function_name as funcion_requerida,
  r.required_signature as firma_requerida,
  (p.oid is not null) as existe,
  coalesce('public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', '-') as firma_encontrada
from required r
left join pg_proc p
  on p.pronamespace = 'public'::regnamespace
 and p.proname = r.function_name
 and oidvectortypes(p.proargtypes) = r.argument_types
order by array_position(array[
  'current_company_id','current_profile_id','is_platform_superadmin','is_company_member','assert_member_of_current_company','finish_check',
  'has_any_role','is_assigned_to_work_order','next_dmp_code','create_case','create_work_order_full','save_check_block_result',
  'unassign_work_order_profile','assign_commercial_work_order','superadmin_create_profile','technician_global_search',
  'normalize_profile_role_names','superadmin_update_profile',
  'mark_alert_as_read','dmp_storage_company_id','dmp_storage_resource_type','dmp_storage_resource_id','can_read_dmp_storage_object',
  'can_write_dmp_storage_object','assert_dmp_storage_path','register_check_photo','register_work_order_photo','register_work_order_signature',
  'register_check_deficiency','register_work_order_deficiency','finish_check_safe','sync_work_order_note','sync_work_order_material_usage'
], r.function_name);
