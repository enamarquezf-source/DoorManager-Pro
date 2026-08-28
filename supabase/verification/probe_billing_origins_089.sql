-- READ ONLY probe for the billing_origins_coherence population. Returns one result set.
with billing_origin_candidates as (
  select wo.*
  from public.work_orders wo
  where wo.deleted_at is null
    and wo.office_validation_status='pending'
    and not (wo.sat_review_status='approved' and ((wo.sat_review_destination='facturacion' and wo.commercial_review_status='not_started') or (wo.sat_review_destination='comercial' and wo.commercial_review_status='approved')))
)
select
  wo.id as work_order_id,
  wo.code,
  wo.status,
  wo.created_at,
  wo.updated_at,
  wo.company_id,
  c.legal_name as client_name,
  s.name as site_name,
  wo.office_validation_status,
  wo.sat_review_status,
  wo.sat_review_destination,
  wo.sat_reviewed_at,
  wo.sat_reviewed_by,
  wo.commercial_review_status,
  wo.commercial_reviewed_at,
  wo.commercial_reviewed_by,
  wo.current_responsible_id,
  coalesce(inv.invoice_work_order_exists, false) as invoice_work_order_exists,
  inv.invoice_ids,
  inv.invoice_statuses,
  'office_validation_status=pending; postflight billing population' as billing_origin_basis,
  (wo.sat_review_status='approved' and ((wo.sat_review_destination='facturacion' and wo.commercial_review_status='not_started') or (wo.sat_review_destination='comercial' and wo.commercial_review_status='approved')) and not coalesce(inv.invoice_work_order_exists, false)) as queue_089_billing_match,
  case
    when wo.sat_review_status='not_started'
      and wo.sat_review_destination is null
      and wo.sat_reviewed_at is null
      and wo.commercial_review_status='not_started'
      and wo.commercial_reviewed_at is null
      then 'legacy_pre_088'
    when wo.sat_review_status='approved' and wo.sat_review_destination='facturacion' and wo.commercial_review_status='not_started'
      then 'routed_from_sat'
    when wo.sat_review_status='approved' and wo.sat_review_destination='comercial' and wo.commercial_review_status='approved'
      then 'routed_from_commercial'
    when wo.sat_review_status='pending'
      and wo.sat_review_destination is null
      and wo.commercial_review_status='not_started'
      and not (wo.sat_review_status='approved' and ((wo.sat_review_destination='facturacion' and wo.commercial_review_status='not_started') or (wo.sat_review_destination='comercial' and wo.commercial_review_status='approved')))
      then 'pending_sat_not_billing'
    when wo.sat_review_status<>'not_started'
      or wo.sat_review_destination is not null
      or wo.sat_reviewed_at is not null
      or wo.commercial_review_status<>'not_started'
      or wo.commercial_reviewed_at is not null
      then 'incoherent_new_routing'
    else 'unknown'
  end as classification
from billing_origin_candidates wo
left join public.clients c on c.id=wo.client_id
left join public.sites s on s.id=wo.site_id
left join lateral (
  select
    true as invoice_work_order_exists,
    string_agg(i.id::text, ', ' order by i.created_at) as invoice_ids,
    string_agg(i.status, ', ' order by i.created_at) as invoice_statuses
  from public.invoice_work_orders iw
  join public.invoices i on i.id=iw.invoice_id
  where iw.work_order_id=wo.id and iw.deleted_at is null
) inv on true
order by wo.updated_at desc, wo.code;
