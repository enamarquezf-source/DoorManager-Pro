-- READ-ONLY preflight for 083.
select to_regclass('public.work_order_quote_line_decisions') as decisions_table,
       to_regclass('public.work_order_cost_entries') as cost_table,
       to_regprocedure('public.dmp_resolve_planned_concept_technical(jsonb)') as technical_rpc;

select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'work_order_quote_line_decisions'
  and column_name in ('decision', 'real_quantity', 'real_unit', 'real_unit_cost', 'notes')
order by column_name;
