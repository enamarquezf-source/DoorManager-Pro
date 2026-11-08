-- Borrado lógico de deficiencias, conservando el check y sus resultados.
begin;
insert into public.permissions(code,description) values
 ('deficiencies.delete','Eliminar deficiencias')
on conflict(code) do update set description=excluded.description;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.name in ('superadmin','SAT','Oficina','Gerencia') and p.code='deficiencies.delete'
on conflict do nothing;

create or replace function public.dmp_delete_deficiency(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_actor public.profiles:=public.dmp024_active_profile();
 v_old public.deficiencies; v_new public.deficiencies;
begin
 if not public.has_any_role(array['superadmin','SAT','Oficina','Gerencia'])
    or not public.has_permission('deficiencies.delete') then
  raise exception 'permiso: no puedes eliminar esta deficiencia';
 end if;
 select * into v_old from public.deficiencies
 where id=p_id and (company_id=v_actor.company_id or public.is_platform_superadmin()) for update;
 if not found then raise exception 'permiso: deficiencia no disponible'; end if;
 if v_old.deleted_at is not null then return; end if;
 update public.deficiencies set deleted_at=now(),updated_at=now()
 where id=p_id returning * into v_new;
 insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data)
 values(v_old.company_id,'deficiencies',p_id,'UPDATE',v_actor.id,to_jsonb(v_old),to_jsonb(v_new));
end $$;
revoke all on function public.dmp_delete_deficiency(uuid) from public,anon;
grant execute on function public.dmp_delete_deficiency(uuid) to authenticated;
commit;
