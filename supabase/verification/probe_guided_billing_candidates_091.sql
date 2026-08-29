-- Read-only probe. Classifies candidates without changing data.
select w.id, w.company_id, w.code, w.economic_status, w.office_validation_status,
       w.sat_review_status, w.sat_review_destination, w.commercial_review_status,
       case
         when w.sat_review_status='approved' and w.sat_review_destination='facturacion' then 'modern_direct'
         when w.sat_review_status='approved' and w.sat_review_destination='comercial' and w.commercial_review_status='approved' then 'modern_via_commercial'
         when w.office_validation_status='validated' and w.economic_status='pendiente_facturar' then 'legacy_office_validated'
         else 'not_eligible'
       end as billing_route_091
from public.work_orders w
where w.deleted_at is null
  and w.economic_status in ('pendiente_facturar','pendiente_validacion')
  and not coalesce(w.warranty,false)
  and coalesce(w.billable,true)
order by w.finished_at nulls last, w.code;
