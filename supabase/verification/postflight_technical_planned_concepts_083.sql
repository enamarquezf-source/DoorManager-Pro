-- READ-ONLY postflight for 083.
select to_regprocedure('public.dmp_resolve_planned_concept_technical(jsonb)') as technical_rpc;

select decision, count(*)
from public.work_order_quote_line_decisions
where deleted_at is null
group by decision
order by decision;

select count(*) as technical_decisions_with_economic_value
from public.work_order_quote_line_decisions
where deleted_at is null and real_unit_cost is not null;
