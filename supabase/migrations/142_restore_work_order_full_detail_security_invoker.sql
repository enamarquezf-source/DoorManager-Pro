-- DoorManager Pro - restore the historical security_invoker option.

alter view public.v_work_order_full_detail
set (security_invoker = true);
