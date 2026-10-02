-- DoorManager Pro - read-only verification for migration 145.
-- Execute after the preflight and after applying 145.
-- This script never changes data or ACLs.
--
-- Required manual session inputs from the human-reviewed remote baseline (no defaults):
-- set local dmp145.expected_service_role_table_update = 'true|false';
-- set local dmp145.expected_service_role_update_columns = '<all 65 names in attnum order, comma-separated>';
-- set local dmp145.expected_service_role_inherit = 'true';
-- set local dmp145.expected_service_role_bypassrls = 'true';
-- set local dmp145.expected_service_role_superuser = 'false';
-- set local dmp145.expected_service_role_inherited_roles = 'service_role';
-- set local dmp145.expected_rpc_execute_public = 'true,false,...';
-- set local dmp145.expected_rpc_execute_anon = 'true,false,...';
-- set local dmp145.expected_rpc_execute_service_role = 'true,false,...';
-- set local dmp145.expected_update_policy_names = 'work_orders_company_policy,work_orders_platform_superadmin_update';
-- set local dmp145.expected_company_using = '(company_id = current_company_id())';
-- set local dmp145.expected_company_check = '(company_id = current_company_id())';
-- set local dmp145.expected_platform_using = 'is_platform_superadmin()';
-- set local dmp145.expected_platform_check = 'is_platform_superadmin()';
-- Supply the human-reviewed values explicitly; missing inputs fail closed.
-- No whitespace/case normalization: deparser output is compared byte-for-byte
-- in the same PostgreSQL environment, including literals and identifiers.
-- The three EXECUTE lists must have eight booleans in canonical writer order.
-- Place actual SET LOCAL statements between BEGIN and DO in the manually
-- reviewed execution copy (or set session variables before running this file).
-- No SQL in this file populates the inputs. Run only after manual review.

begin;
set transaction read only;

do $$
declare
  v_table_oid oid;
  v_role_exists boolean;
  v_column text;
  v_expected_service_table_update boolean;
  v_expected_service_columns text[];
  v_baseline_service_columns constant text[] := string_to_array(
    'id,company_id,code,case_id,client_id,site_id,main_equipment_id,title,description,type,priority,status,origin,scheduled_date,scheduled_time,estimated_duration_minutes,main_technician_id,technical_team,contact_id,access_requirement_id,planned_material,diagnosis,work_performed,result,finished_at,sent_at,created_by,created_role,updated_by,current_responsible_id,created_at,updated_at,deleted_at,observations,economic_status,billable,warranty,estimated_sale_amount,real_cost_amount,estimated_margin_amount,invoiced_amount,paid_amount,quote_id,quoted_sale_amount,additional_sale_amount,sale_amount,margin_amount,office_validation_status,office_validated_at,office_validated_by,office_validation_reason,sat_review_status,sat_review_destination,sat_review_flags,sat_review_reason,sat_reviewed_at,sat_reviewed_by,commercial_review_status,commercial_review_reason,commercial_reviewed_at,commercial_reviewed_by,economic_review_status,economic_reviewed_at,economic_reviewed_by,economic_review_reason', ',');
  v_actual_service_columns text[];
  v_rpc oid;
  v_owner oid;
  v_expected_columns_setting text;
  v_expected_inherit boolean;
  v_expected_bypassrls boolean;
  v_expected_superuser boolean;
  v_expected_inherited_roles text[];
  v_actual_inherited_roles text[];
  v_rpc_index integer := 0;
  v_rpc_public text[];
  v_rpc_anon text[];
  v_rpc_service text[];
  v_role_name text;
  v_expected_executions text[];
  v_actual_execution boolean;
  v_expected_policy_names text[];
  v_actual_policy_names text[];
  v_policy record;
  v_expected_using text;
  v_expected_check text;
  v_editable_columns constant text[] := array[
    'case_id',
    'quote_id',
    'client_id',
    'site_id',
    'main_equipment_id',
    'contact_id',
    'access_requirement_id',
    'title',
    'description',
    'type',
    'priority',
    'origin',
    'scheduled_date',
    'scheduled_time',
    'estimated_duration_minutes',
    'planned_material',
    'technical_team',
    'diagnosis',
    'work_performed',
    'result'
  ];
begin
  v_table_oid := to_regclass('public.work_orders');
  if v_table_oid is null then raise exception '145 verify: public.work_orders no existe'; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception '145 verify: ROLE_MISSING anon/authenticated';
  end if;
  v_rpc_public := string_to_array(current_setting('dmp145.expected_rpc_execute_public', true), ',');
  v_rpc_anon := string_to_array(current_setting('dmp145.expected_rpc_execute_anon', true), ',');
  v_rpc_service := string_to_array(current_setting('dmp145.expected_rpc_execute_service_role', true), ',');
  if cardinality(v_rpc_public) is distinct from 8 or cardinality(v_rpc_anon) is distinct from 8
     or cardinality(v_rpc_service) is distinct from 8 then
    raise exception '145 verify: PENDING PREFLIGHT - falta baseline EXECUTE de los ocho writers y tres roles';
  end if;
  if exists (select 1 from unnest(v_rpc_public || v_rpc_anon || v_rpc_service) v
              where v not in ('true', 'false')) then
    raise exception '145 verify: baseline EXECUTE invalido';
  end if;
  if v_rpc_public is distinct from array['false','false','false','false','false','true','false','false']::text[]
     or v_rpc_anon is distinct from array['false','false','false','false','false','true','false','false']::text[]
     or v_rpc_service is distinct from array['true','true','true','true','true','true','true','true']::text[] then
    raise exception '145 verify: baseline EXECUTE difiere del humano';
  end if;
  if cardinality(v_editable_columns) <> 20 then raise exception '145 verify: allowlist no contiene exactamente 20 columnas'; end if;

  if exists (
    select 1
    from unnest(v_editable_columns) expected(column_name)
    where not exists (
      select 1
      from pg_attribute a
      where a.attrelid = v_table_oid
        and a.attname = expected.column_name
        and a.attnum > 0
        and not a.attisdropped
    )
  ) then
    raise exception '145 verify: falta una columna editable esperada en public.work_orders';
  end if;

  if has_table_privilege('anon', v_table_oid, 'UPDATE') then
    raise exception '145 verify: anon conserva UPDATE de tabla';
  end if;
  if has_table_privilege('authenticated', v_table_oid, 'UPDATE') then
    raise exception '145 verify: authenticated conserva UPDATE de tabla';
  end if;

  if exists (
    select 1
    from aclexplode((select relacl from pg_class where oid = v_table_oid)) acl
    where acl.privilege_type = 'UPDATE'
      and acl.grantee in (
        0,
        coalesce((select oid from pg_roles where rolname = 'anon'), 0),
        coalesce((select oid from pg_roles where rolname = 'authenticated'), 0)
      )
  ) then
    raise exception '145 verify: PUBLIC/anon/authenticated conserva UPDATE de tabla';
  end if;

  if exists (
    select 1
    from pg_attribute a
    where a.attrelid = v_table_oid
      and a.attnum > 0
      and not a.attisdropped
      and not (a.attname = any(v_editable_columns))
      and has_column_privilege('authenticated', v_table_oid, a.attname, 'UPDATE')
  ) then
    raise exception '145 verify: authenticated tiene UPDATE fuera de la allowlist';
  end if;

  if exists (
    select 1
    from unnest(v_editable_columns) expected(column_name)
    where not has_column_privilege('authenticated', v_table_oid, expected.column_name, 'UPDATE')
  ) then
    raise exception '145 verify: authenticated no tiene UPDATE sobre una columna editable';
  end if;

  if exists (
    select 1
    from pg_attribute a
    where a.attrelid = v_table_oid
      and a.attnum > 0
      and not a.attisdropped
      and has_column_privilege('anon', v_table_oid, a.attname, 'UPDATE')
  ) then
    raise exception '145 verify: anon tiene UPDATE sobre alguna columna real';
  end if;

  if exists (
    select 1
    from pg_attribute a
    cross join lateral aclexplode(a.attacl) acl
    where a.attrelid = v_table_oid
      and a.attnum > 0
      and not a.attisdropped
      and acl.grantee = 0
      and acl.privilege_type = 'UPDATE'
  ) then
    raise exception '145 verify: PUBLIC tiene UPDATE explicito sobre alguna columna real';
  end if;

  -- Compare effective privileges across *all* real columns: table-level grants
  -- and inherited/PUBLIC privileges must not escape the authenticated allowlist.
  if exists (
    select 1 from pg_attribute a
    where a.attrelid = v_table_oid and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', v_table_oid, a.attname, 'UPDATE')
          is distinct from (a.attname = any(v_editable_columns))
  ) then
    raise exception '145 verify: authenticated UPDATE no coincide con las columnas reales permitidas';
  end if;
  if exists (
    select 1 from pg_attribute a
    where a.attrelid = v_table_oid and a.attnum > 0 and not a.attisdropped
      and (
        exists (select 1 from aclexplode(a.attacl) acl
                where acl.grantee = 0 and acl.privilege_type = 'UPDATE')
         or exists (select 1 from aclexplode(coalesce((select relacl from pg_class where oid = v_table_oid),
                                                     acldefault('r', (select relowner from pg_class where oid = v_table_oid)))) acl
                   where acl.grantee = 0 and acl.privilege_type = 'UPDATE')
      )
  ) then
    raise exception '145 verify: PUBLIC conserva UPDATE efectivo en una columna real';
  end if;

  select exists (select 1 from pg_roles where rolname = 'service_role') into v_role_exists;
  if not v_role_exists then
    raise exception '145 verify: PENDING PREFLIGHT - service_role ROLE_MISSING; requiere evidencia humana';
  else
    v_expected_service_table_update := nullif(current_setting('dmp145.expected_service_role_table_update', true), '')::boolean;
    if current_setting('dmp145.expected_service_role_table_update', true) not in ('true', 'false')
       or v_expected_service_table_update is null then
      raise exception '145 verify: falta el preflight real de service_role_table_update';
    end if;
    if v_expected_service_table_update is distinct from true then
      raise exception '145 verify: baseline service_role table UPDATE difiere del humano';
    end if;
    if current_setting('dmp145.expected_service_role_inherit', true) not in ('true', 'false')
       or current_setting('dmp145.expected_service_role_bypassrls', true) not in ('true', 'false')
       or current_setting('dmp145.expected_service_role_superuser', true) not in ('true', 'false') then
      raise exception '145 verify: faltan flags de service_role del preflight';
    end if;
    v_expected_inherit := current_setting('dmp145.expected_service_role_inherit', true)::boolean;
    v_expected_bypassrls := current_setting('dmp145.expected_service_role_bypassrls', true)::boolean;
    v_expected_superuser := current_setting('dmp145.expected_service_role_superuser', true)::boolean;
    if (v_expected_inherit, v_expected_bypassrls, v_expected_superuser) is distinct from (true, true, false) then
      raise exception '145 verify: flags de service_role difieren del baseline humano';
    end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role'
       and rolinherit = v_expected_inherit and rolbypassrls = v_expected_bypassrls
       and rolsuper = v_expected_superuser) then
      raise exception '145 verify: flags de service_role no preservados';
    end if;
    if current_setting('dmp145.expected_service_role_inherited_roles', true) is null then
      raise exception '145 verify: faltan roles heredados de service_role';
    end if;
    v_expected_inherited_roles := string_to_array(current_setting('dmp145.expected_service_role_inherited_roles', true), ',');
    if v_expected_inherited_roles is distinct from array['service_role']::text[] then
      raise exception '145 verify: roles heredados no coinciden con baseline humano';
    end if;
    select coalesce(array_agg(r.rolname order by r.rolname), '{}'::text[])
      into v_actual_inherited_roles from pg_roles r
      where pg_has_role('service_role', r.oid, 'USAGE');
    if v_actual_inherited_roles is distinct from v_expected_inherited_roles then
      raise exception '145 verify: roles heredados de service_role no preservados';
    end if;
    v_expected_columns_setting := current_setting('dmp145.expected_service_role_update_columns', true);
    if nullif(v_expected_columns_setting, '') is null then
      raise exception '145 verify: PENDING PREFLIGHT - faltan columnas de service_role';
    end if;
    v_expected_service_columns := string_to_array(v_expected_columns_setting, ',');
    if cardinality(v_expected_service_columns) <> 65 or exists (
      select 1 from unnest(v_expected_service_columns) c where c = ''
    ) then raise exception '145 verify: baseline de 65 columnas incompleto'; end if;
    if v_expected_service_columns is distinct from v_baseline_service_columns then
      raise exception '145 verify: columnas de service_role difieren del baseline humano';
    end if;

    select coalesce(array_agg(a.attname order by a.attnum), '{}'::text[])
    into v_actual_service_columns
    from pg_attribute a
    where a.attrelid = v_table_oid
      and a.attnum > 0
      and not a.attisdropped
      and has_column_privilege('service_role', v_table_oid, a.attname, 'UPDATE');

    if v_actual_service_columns <> v_expected_service_columns then
      raise exception '145 verify: columnas UPDATE de service_role no preservadas. expected=%, actual=%', v_expected_service_columns, v_actual_service_columns;
    end if;
    if has_table_privilege('service_role', v_table_oid, 'UPDATE') is distinct from v_expected_service_table_update then
      raise exception '145 verify: table-level UPDATE de service_role no preservado. expected=%, actual=%', v_expected_service_table_update, has_table_privilege('service_role', v_table_oid, 'UPDATE');
    end if;
  end if;

  if not exists (select 1 from pg_class where oid = v_table_oid and relrowsecurity) then
    raise exception '145 verify: RLS deshabilitado en work_orders';
  end if;
  -- Audit the complete UPDATE/ALL surface, not just the named policy.
  if exists (
    select 1 from pg_policy p
    where p.polrelid = v_table_oid and p.polcmd in ('w', '*')
      and (0 = any(p.polroles)
        or (select oid from pg_roles where rolname = 'anon') = any(p.polroles)
        or exists (select 1 from unnest(p.polroles) role_oid
                   where role_oid <> 0 and not exists (select 1 from pg_roles where oid = role_oid)))
  ) then
    raise exception '145 verify: UPDATE/ALL policy PUBLIC/anon/ROLE_MISSING';
  end if;
  if nullif(current_setting('dmp145.expected_update_policy_names', true), '') is null then
    raise exception '145 verify: PENDING PREFLIGHT - falta inventario UPDATE/ALL policies';
  end if;
  v_expected_policy_names := string_to_array(current_setting('dmp145.expected_update_policy_names', true), ',');
  select coalesce(array_agg(p.polname order by p.polname), '{}'::text[])
  into v_actual_policy_names from pg_policy p
  where p.polrelid = v_table_oid and p.polcmd in ('w', '*');
  if v_actual_policy_names is distinct from v_expected_policy_names then
    raise exception '145 verify: UPDATE/ALL policies difieren del preflight. expected=%, actual=%',
      v_expected_policy_names, v_actual_policy_names;
  end if;
  if v_expected_policy_names is distinct from array['work_orders_company_policy', 'work_orders_platform_superadmin_update']::text[] then
    raise exception '145 verify: inventario no coincide con baseline humano';
  end if;
  for v_policy in
    select p.polname, p.polcmd, p.polpermissive, p.polroles,
           pg_get_expr(p.polqual, p.polrelid) as using_expr,
           pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
    from pg_policy p where p.polrelid = v_table_oid and p.polcmd in ('w', '*')
  loop
    if v_policy.polcmd is distinct from (case v_policy.polname when 'work_orders_company_policy' then '*' else 'w' end)
       or not v_policy.polpermissive
       or v_policy.polroles is distinct from array[(select oid from pg_roles where rolname = 'authenticated')]::oid[] then
      raise exception '145 verify: UPDATE policy command/mode/roles no coincide: %', v_policy.polname;
    end if;
    if v_policy.polname = 'work_orders_company_policy' then
      v_expected_using := current_setting('dmp145.expected_company_using', true);
      v_expected_check := current_setting('dmp145.expected_company_check', true);
    elsif v_policy.polname = 'work_orders_platform_superadmin_update' then
      v_expected_using := current_setting('dmp145.expected_platform_using', true);
      v_expected_check := current_setting('dmp145.expected_platform_check', true);
    else
      raise exception '145 verify: unexpected UPDATE/ALL policy: %', v_policy.polname;
    end if;
    if nullif(v_expected_using, '') is null or nullif(v_expected_check, '') is null then
      raise exception '145 verify: WAITING_FOR_REMOTE_PREFLIGHT - exact reviewed expressions missing: %', v_policy.polname;
    end if;
    if v_expected_using is distinct from (case v_policy.polname when 'work_orders_company_policy'
         then '(company_id = current_company_id())' else 'is_platform_superadmin()' end)
       or v_expected_check is distinct from (case v_policy.polname when 'work_orders_company_policy'
         then '(company_id = current_company_id())' else 'is_platform_superadmin()' end) then
      raise exception '145 verify: policy expression input differs from human baseline: %', v_policy.polname;
    end if;
    if v_policy.using_expr is distinct from v_expected_using
       or v_policy.check_expr is distinct from v_expected_check then
      raise exception '145 verify: UPDATE policy expression differs from reviewed baseline: %', v_policy.polname;
    end if;
  end loop;

  for v_column in select unnest(array[
    'dmp_change_work_order_status(uuid,text,text)',
    'dmp_finalize_work_order_technical(uuid,jsonb)',
    'dmp_review_work_order_sat(uuid,text,text,uuid,jsonb,text)',
    'dmp_review_work_order_office(uuid,text,text)',
    'request_work_order_return(uuid,uuid,text)',
    'change_work_order_status(uuid,text,uuid,text,boolean,numeric,numeric)',
    'dmp_archive_entity(text,uuid,text)',
    'dmp_restore_entity(text,uuid,text)'
  ]) loop
    v_rpc_index := v_rpc_index + 1;
    v_rpc := to_regprocedure('public.' || v_column);
    if v_rpc is null then
      raise exception '145 verify: falta writer canonico public.%', v_column;
    end if;
    select p.proowner into v_owner from pg_proc p where p.oid = v_rpc;
    if not exists (select 1 from pg_roles where oid = v_owner) then
      raise exception '145 verify: writer sin owner existente: %', v_column;
    end if;
    if not has_table_privilege(v_owner, v_table_oid, 'UPDATE') then
      raise exception '145 verify: owner sin UPDATE efectivo de tabla: %', v_column;
    end if;
    if not exists (select 1 from pg_proc p where p.oid = v_rpc and p.prosecdef
      and exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg where cfg = 'search_path=public')) then
      raise exception '145 verify: writer no es SECURITY DEFINER/search_path public: %', v_column;
    end if;
    if not has_function_privilege('authenticated', v_rpc, 'EXECUTE') then
      raise exception '145 verify: authenticated sin EXECUTE writer: %', v_column;
    end if;
    foreach v_role_name in array array['PUBLIC', 'anon', 'service_role'] loop
      v_expected_executions := case v_role_name when 'PUBLIC' then v_rpc_public
         when 'anon' then v_rpc_anon else v_rpc_service end;
      if v_role_name = 'PUBLIC' then
        if exists (select 1 from pg_proc p cross join lateral aclexplode(p.proacl) acl
                   where p.oid = v_rpc and acl.grantee = 0 and acl.privilege_type = 'EXECUTE')
           and v_expected_executions[v_rpc_index]::boolean is distinct from true then
          raise exception '145 verify: EXECUTE PUBLIC explicito fuera del baseline para %', v_column;
        end if;
        select exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
                       where acl.grantee = 0 and acl.privilege_type = 'EXECUTE')
          into v_actual_execution from pg_proc p where p.oid = v_rpc;
      else
        v_actual_execution := has_function_privilege(v_role_name, v_rpc, 'EXECUTE');
      end if;
      if v_actual_execution is distinct from v_expected_executions[v_rpc_index]::boolean then
        raise exception '145 verify: EXECUTE % no coincide con preflight para %', v_role_name, v_column;
      end if;
    end loop;
  end loop;
end;
$$;

rollback;
