-- Read-only report: investigate these records before any status correction.
select wo.id, wo.code, wo.company_id, wo.status, wo.sat_review_status,
       wo.office_validation_status, wo.finished_at,
       c.legal_name as client_name, s.name as site_name,
       case when wo.status in ('Finalizado tecnicamente','Devuelto por SAT')
            then 'reviewable' else 'inconsistent_status' end as diagnosis
from public.work_orders wo
left join public.clients c on c.id = wo.client_id
left join public.sites s on s.id = wo.site_id
where wo.deleted_at is null
  and wo.sat_review_status in ('pending','returned')
order by wo.company_id, wo.code;
