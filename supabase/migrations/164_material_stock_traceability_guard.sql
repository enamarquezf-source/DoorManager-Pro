-- Protege descuentos nuevos sin recalcular o compensar consumos historicos.
begin;
create or replace function public.dmp_guard_material_stock_traceability()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(new.stock_deducted_quantity, 0) < 0 then
    raise exception 'validacion del formulario: el descuento de stock no puede ser negativo';
  end if;
  if coalesce(new.stock_deducted_quantity, 0) > 0 and (
    new.stock_validation_status is distinct from 'validated' or new.stock_warehouse_id is null
  ) then
    -- Permite editar notas/precios de un historico sin atribuirle un almacen ficticio.
    if tg_op = 'UPDATE' then
      if row(new.company_id,new.work_order_id,new.material_id,new.used_quantity,
             new.stock_validation_status,new.stock_warehouse_id,new.stock_deducted_quantity)
        is not distinct from
         row(old.company_id,old.work_order_id,old.material_id,old.used_quantity,
             old.stock_validation_status,old.stock_warehouse_id,old.stock_deducted_quantity) then
        return new;
      end if;
    end if;
    raise exception 'validacion del formulario: descontar stock requiere validacion y un almacen asociado. Los consumos historicos necesitan revisar su trazabilidad antes de cambiar cantidades.';
  end if;
  return new;
end $$;
revoke all on function public.dmp_guard_material_stock_traceability() from public, anon, authenticated;
drop trigger if exists guard_material_stock_traceability on public.work_order_materials;
create trigger guard_material_stock_traceability before insert or update on public.work_order_materials
for each row execute function public.dmp_guard_material_stock_traceability();

-- Prueba del trigger sobre una tabla temporal sin claves externas ni datos reales.
-- Un fallo revierte toda la migracion; la tabla desaparece al terminar.
create temporary table dmp_stock_traceability_probe (like public.work_order_materials including defaults) on commit drop;
insert into dmp_stock_traceability_probe(id,company_id,work_order_id,material_id,used_quantity,stock_deducted_quantity,stock_validation_status)
values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004',1,1,'validated');
create trigger traceability_probe before insert or update on dmp_stock_traceability_probe
for each row execute function public.dmp_guard_material_stock_traceability();
do $$
begin
  -- Conserva el historico al modificar una nota; impide convertirlo en otro consumo.
  update dmp_stock_traceability_probe set notes='Prueba temporal' where id='00000000-0000-0000-0000-000000000001';
  begin
    update dmp_stock_traceability_probe set used_quantity=2 where id='00000000-0000-0000-0000-000000000001';
    raise exception using errcode='XX000', message='El trigger ha permitido cambiar la cantidad historica';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'validacion del formulario: descontar stock requiere%' then raise; end if;
  end;
  begin
    insert into dmp_stock_traceability_probe(company_id,work_order_id,material_id,used_quantity,stock_deducted_quantity,stock_validation_status)
    values('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004',1,1,'validated');
    raise exception using errcode='XX000', message='El trigger ha permitido descontar sin almacen';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'validacion del formulario: descontar stock requiere%' then raise; end if;
  end;
  begin
    insert into dmp_stock_traceability_probe(company_id,work_order_id,material_id,used_quantity,stock_deducted_quantity,stock_validation_status,stock_warehouse_id)
    values('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004',1,1,'pending','00000000-0000-0000-0000-000000000005');
    raise exception using errcode='XX000', message='El trigger ha permitido un descuento pendiente';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'validacion del formulario: descontar stock requiere%' then raise; end if;
  end;
  -- Un consumo canonico nuevo y uno pendiente sin descuento siguen permitidos.
  insert into dmp_stock_traceability_probe(company_id,work_order_id,material_id,used_quantity,stock_deducted_quantity,stock_validation_status,stock_warehouse_id)
  values('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004',1,1,'validated','00000000-0000-0000-0000-000000000005'),
        ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004',1,0,'pending',null);
end $$;
commit;
