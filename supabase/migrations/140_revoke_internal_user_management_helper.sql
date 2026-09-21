-- DoorManager Pro - revoke client execution of the internal transition helper.
begin;

revoke all on function public.dmp_assert_user_management_transition(uuid, boolean, text[]) from public, anon, authenticated;

commit;
