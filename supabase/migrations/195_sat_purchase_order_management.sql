-- Allow SAT to manage purchase orders, without granting purchase receipt actions.
begin;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.code in (
    'purchase_orders.read',
    'purchase_orders.create',
    'purchase_orders.update',
    'purchase_orders.submit',
    'purchase_orders.cancel'
  )
where r.name = 'SAT'
on conflict do nothing;

commit;
