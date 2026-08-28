-- READ ONLY probe. Returns one result set with every pending commercial review.
select
  wo.id as work_order_id,
  wo.code,
  wo.status,
  wo.company_id,
  c.legal_name as client_name,
  s.name as site_name,
  wo.sat_review_status,
  wo.sat_review_destination,
  wo.sat_reviewed_at,
  wo.sat_reviewed_by,
  wo.current_responsible_id,
  nullif(trim(coalesce(rp.first_name || ' ', '') || coalesce(rp.last_name, '')), '') as responsible_name,
  rp.active as responsible_active,
  rp.company_id as responsible_company_id,
  coalesce(string_agg(distinct rr.name, ', ' order by rr.name), '') as responsible_roles,
  case when rp.id is not null
    and rp.company_id = wo.company_id
    and rp.active = true
    and rp.deleted_at is null
    and (rp.primary_area = 'Comercial' or bool_or(rr.name = 'Comercial'))
    then 'SI' else 'NO' end as responsible_is_valid_commercial,
  wo.office_validation_status,
  wo.quote_id,
  q.code as quote_code,
  wo.deleted_at
from public.work_orders wo
left join public.clients c on c.id = wo.client_id
left join public.sites s on s.id = wo.site_id
left join public.profiles rp on rp.id = wo.current_responsible_id
left join public.profile_roles pr on pr.profile_id = rp.id
left join public.roles rr on rr.id = pr.role_id
left join public.quotes q on q.id = wo.quote_id
where wo.commercial_review_status = 'pending'
group by wo.id, c.legal_name, s.name, rp.id, q.code
order by wo.updated_at desc, wo.code;
