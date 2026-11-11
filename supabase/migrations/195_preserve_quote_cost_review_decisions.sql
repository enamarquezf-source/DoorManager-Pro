begin;

create or replace function public.dmp_quote_line_cost_snapshot_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_line public.quote_lines; v_catalog uuid; v_billing text; v_period integer;
begin
  -- Initialize the snapshot when linking the cost to a quote line.
  -- Subsequent reviews can change the sale price and billing decision.
  if tg_op = 'UPDATE' then
    if new.quote_line_id is not distinct from old.quote_line_id then
      return new;
    end if;
  end if;
  if new.quote_line_id is not null then
    select * into v_line from public.quote_lines where id = new.quote_line_id;
    if v_line.id is not null then
      new.unit_cost := coalesce(v_line.unit_cost, 0);
      new.unit_price := coalesce(v_line.unit_price, 0);
      new.total_cost := round(coalesce(new.quantity,0) * new.unit_cost, 2);
      new.total_price := round(coalesce(new.quantity,0) * new.unit_price, 2);
      new.rate_version_id := coalesce(new.rate_version_id, v_line.rate_version_id);
       select id into v_catalog from public.rate_catalog where company_id = new.company_id and code = new.cost_type and classification = 'cost' and deleted_at is null limit 1;
       new.concept_id := coalesce(new.concept_id, v_line.concept_id, v_catalog);
       new.rate_id := coalesce(new.rate_id, new.concept_id);
       select rc.billing_mode, rc.period_days into v_billing, v_period from public.rate_catalog rc where rc.id = new.rate_id;
        new.billing_mode := v_billing; new.period_days := v_period; new.contributes_to_sale := coalesce(v_line.contributes_to_sale,false);
    end if;
  end if;
  return new;
end $$;

commit;
