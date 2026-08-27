-- DoorManager Pro - corrige las operaciones de auditoria usadas por 073-075.
-- Idempotente. Solo modifica la constraint explicita de audit_log.

begin;

alter table public.audit_log drop constraint if exists audit_log_operation_check;

alter table public.audit_log
  add constraint audit_log_operation_check
  check (operation in (
    'INSERT',
    'UPDATE',
    'DELETE',
    'SOFT_DELETE',
    'OPERATIONAL_UPDATE',
    'TECHNICAL_FINALIZE',
    'TECHNICAL_FINALIZE_PENDING_OFFICE',
    'OFFICE_VALIDATE',
    'OFFICE_REJECT',
    'INVOICE_ISSUE',
    'PAYMENT_RECORD',
    'MATERIAL_CREATE'
  ));

commit;
