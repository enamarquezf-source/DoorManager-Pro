-- DoorManager Pro - permite auditar correcciones operativas reales de partes.

begin;

alter table public.audit_log drop constraint if exists audit_log_operation_check;

alter table public.audit_log
  add constraint audit_log_operation_check
  check (operation in ('INSERT','UPDATE','DELETE','SOFT_DELETE','OPERATIONAL_UPDATE'));

commit;
