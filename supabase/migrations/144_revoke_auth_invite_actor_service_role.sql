-- DoorManager Pro - revoke service_role execute on the internal AUTH-1 actor helper.
begin;

revoke execute on function public.dmp_auth_invite_actor(uuid) from service_role;

commit;
