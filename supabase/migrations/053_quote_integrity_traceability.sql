-- DoorManager Pro - integridad y trazabilidad de presupuestos (QUO-01 a QUO-07).
-- Idempotente. Parte de las versiones MÁS RECIENTES de las funciones implicadas:
--   - dmp_finalize_work_order_technical: version efectiva de 045.
--   - dmp_quote_lines_set_totals_trigger: version efectiva de 036 (y 034).
--   - create_work_order_full: version efectiva de 048.
-- No modifica migraciones 001-052, mantiene RLS y no usa claves de servicio.
-- Correcciones:
--   QUO-01/02: quote_status_history + transicion segura dmp_quote_transition_apply
--     (unica logica server-side de validacion y trazabilidad). La guarda de estado usa
--     DOS capas y NO depende de current_user ni del propietario SQL de ninguna funcion:
--       (1) privilegio (minimo privilegio en public.quotes): anon/authenticated pierden
--           el UPDATE de tabla; authenticated conserva UPDATE solo sobre las columnas
--           realmente editables por el formulario. status, sent_at/sent_to_email,
--           work_order_id, campos economicos calculados y campos de ciclo de vida/auditoria
--           quedan FUERA del UPDATE directo (funciones con definidor de seguridad).
--           service_role no se toca (rol de infraestructura; la seguridad no depende de el).
--       (2) trigger BEFORE UPDATE: solo admite el UPDATE cuando el nucleo seguro marca
--           una ruta autorizada (set_config) que se limpia AL INSTANTE tras el UPDATE.
--   El recalculado economico (dmp_recalculate_quote_totals, version efectiva de 038)
--     pasa a SECURITY DEFINER sin tocar formulas, y los triggers que lo invocan (lineas y
--     descuento) quedan con definidor de seguridad: los campos calculados ya no son
--     escribibles por el cliente pero el recalc interno sigue funcionando.
--   QUO-03/10: position auto = max(position)+1 con advisory lock por presupuesto.
--   QUO-04: discount_percent por linea aplicado de verdad (total_price descontado) +
--     backfill CONSERVADOR: solo presupuestos editables (Borrador/Enviado) y solo lineas
--     cuyo total calculado difiere del almacenado. Los historicos en estados terminales
--     (Aceptado, Ejecutado en cliente, Rechazado, Caducado, Cancelado) NO se tocan.
--   QUO-05: preflight READ-ONLY de presupuestos con mas de un parte activo (sin
--     reconciliar ni borrar nada) + indice unico parcial + validacion en create_work_order_full.
--   QUO-06: 'Enviado' exige email de destino y registra sent_at/sent_to_email.
--   QUO-07: deleteLine (frontend) rellena deleted_by/delete_reason.
--   QUO-08: guarda de superficie INSERT. Las politicas INSERT de quotes solo validan
--     company_id + rol (with check), por lo que un POST directo a /rest/v1/quotes (rol
--     authenticated) PODIA crear un presupuesto ya 'Aceptado' con sent_at/sent_to_email,
--     totales arbitrarios y/o ciclo de vida relleno, sin pasar por la logica segura.
--     Un BEFORE INSERT trigger normaliza todo new a nivel de DATOS (independiente del rol
--     invocador): status siempre 'Borrador' (el unico cambio valido posterior es via
--     dmp_change_quote_status -> dmp_quote_transition_apply), envio y ciclo de vida a
--     null, y economicos calculados a 0 (los escribe dmp_recalculate_quote_totals al
--     insertar lineas). NO toca company_id (lo envia el servicio con currentCompanyId() y
--     lo valida la RLS), NO toca code (sigue la via trg_quotes_auto_code -> next_dmp_code)
--     ni created_by (lo envia el servicio con currentProfileId()): el alta legitima de
--     quotesService.create() no necesita cambios y el trigger 034 de code sigue funcionando.
-- Version: 053.5 (minimo privilegio: revoke UPDATE de tabla + grants por columna +
-- recalc SECURITY DEFINER desde 038 + guarda BEFORE INSERT de superficie).

begin;

-- ============================================================
-- QUO-01/02: historial de cambios de estado de presupuestos
-- ============================================================

create table if not exists public.quote_status_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  quote_id uuid not null references public.quotes(id),
  previous_status text,
  new_status text not null,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now(),
  reason text,
  manual_correction boolean not null default false
);

create index if not exists quote_status_history_quote_idx
  on public.quote_status_history(quote_id, changed_at);

alter table public.quote_status_history enable row level security;

drop policy if exists quote_status_history_select_authorized_roles on public.quote_status_history;
create policy quote_status_history_select_authorized_roles on public.quote_status_history for select to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT','Oficina']));

-- Solo lectura desde el cliente: las escrituras se hacen via RPC / codigo con definidor de seguridad.
drop policy if exists quote_status_history_write_denied on public.quote_status_history;
create policy quote_status_history_write_denied on public.quote_status_history for insert to authenticated with check (false);
create policy quote_status_history_update_denied on public.quote_status_history for update to authenticated using (false);
create policy quote_status_history_delete_denied on public.quote_status_history for delete to authenticated using (false);

-- ============================================================
-- QUO-02: matriz de transiciones validas (sin inventar estados).
-- Unificada con el nucleo dmp_quote_transition_apply: estado -> mismo estado es
-- INVALIDO tambien aqui (no se genera historial falso p.ej. Aceptado -> Aceptado).
-- ============================================================

create or replace function public.dmp_quote_has_generated_work_order(p_quote_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.work_orders
    where quote_id = p_quote_id and deleted_at is null
  );
$$;

create or replace function public.dmp_quote_status_transition_valid(p_previous text, p_new text, p_has_work_order boolean)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    (
      (p_previous = 'Borrador' and p_new in ('Enviado','Aceptado','Rechazado','Caducado','Cancelado'))
      or (p_previous = 'Enviado' and p_new in ('Borrador','Aceptado','Rechazado','Caducado','Cancelado'))
      or (p_previous = 'Aceptado' and p_new in ('Rechazado','Caducado','Cancelado','Ejecutado en cliente'))
      or (p_previous = 'Ejecutado en cliente' and false)
      or (p_previous = 'Rechazado' and p_new in ('Borrador','Enviado'))
      or (p_previous = 'Caducado' and p_new in ('Borrador','Enviado'))
      or (p_previous = 'Cancelado' and p_new in ('Borrador','Enviado'))
    )
    and p_new is distinct from p_previous
    and not (p_new in ('Borrador','Enviado') and p_has_work_order);
$$;

-- Nucleos internos de QUO-02: solo los invoca codigo con definidor de seguridad
-- (dmp_quote_transition_apply y create_work_order_full). No se conceden a nadie fuera
-- del propietario para que no queden expuestas como RPC a PUBLIC/anon/authenticated.
revoke all on function public.dmp_quote_has_generated_work_order(uuid) from public;
revoke all on function public.dmp_quote_has_generated_work_order(uuid) from anon;
revoke all on function public.dmp_quote_has_generated_work_order(uuid) from authenticated;

revoke all on function public.dmp_quote_status_transition_valid(text, text, boolean) from public;
revoke all on function public.dmp_quote_status_transition_valid(text, text, boolean) from anon;
revoke all on function public.dmp_quote_status_transition_valid(text, text, boolean) from authenticated;

-- ============================================================
-- QUO-01/02: guarda de estado server-side en DOS capas.
--   CAPA 1 (privilegio, autoritativa): se aplica el PRINCIPIO DE MINIMO PRIVILEGIO.
--   En produccion se verifico que anon, authenticated y service_role tenian UPDATE a
--   nivel de tabla sobre public.quotes (pudiendo modificar TODAS las columnas, incluidos
--   status y totales). Desde 053 los roles de cliente (anon/authenticated) PIERDEN el
--   UPDATE de tabla y solo authenticated conserva UPDATE por COLUMNA sobre las columnas
--   realmente editables por el formulario. status, sent_at/sent_to_email, work_order_id,
--   los campos economicos calculados (subtotal_cost, subtotal_sale, subtotal,
--   discount_amount, taxable_base, tax_amount, total, total_amount, estimated_margin) y
--   los de ciclo de vida/auditoria (deleted_at, deleted_by, delete_reason, id, company_id,
--   code, created_by, created_at, issue_date) quedan FUERA del UPDATE directo: solo los
--   escriben funciones con definidor de seguridad. service_role NO se toca: es el rol de
--   infraestructura y DoorManager no lo usa en runtime; la seguridad funcional no depende
--   de el.
--   PostgREST respeta los privilegios por columna: un PATCH /quotes con "status", totales
--   o campos de envio falla por permisos ANTES de tocar RLS o triggers.
--   CAPA 2 (trigger): defensa en profundidad para cualquier UPDATE que llegue a la
--   columna status desde contextos con privilegio (definidor de seguridad / owner). Solo
--   admite la operacion marcada por el nucleo dmp_quote_transition_apply (unica logica
--   de validacion y trazabilidad) y SIN depender de current_user ni del propietario SQL.
-- ============================================================

revoke update on public.quotes from anon, authenticated;

grant update (client_id, site_id, equipment_id, opportunity_id, case_id, quote_type, title, description, valid_until, discount_type, discount_value, conditions, updated_by, updated_at) on public.quotes to authenticated;

-- ============================================================
-- QUO-01/02/04: recalculado de totales como SECURITY DEFINER.
-- Con la CAPA 1 el cliente ya NO puede UPDATE de los campos economicos. El recalculado
-- debe seguir funcionando internamente (triggers de lineas y de descuento), asi que
-- dmp_recalculate_quote_totals se redefine AQUI con la version efectiva de 038 (mismas
-- formulas, sin cambios) pero como SECURITY DEFINER: se ejecuta como propietario y
-- actualiza los campos calculados sin depender de permisos del invocador.
-- EXECUTE se restringe: no es una RPC de cliente, solo la invocan los triggers y el
-- codigo server-side con definidor de seguridad (el UPDATE que hace ya omitia status).
-- ============================================================

create or replace function public.dmp_recalculate_quote_totals(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cost numeric(12,2);
  v_sale numeric(12,2);
  v_tax numeric(12,2);
  v_discount numeric(12,2);
  v_taxable numeric(12,2);
  v_discount_type text;
  v_discount_value numeric(12,2);
begin
  select
    coalesce(sum(total_cost), 0),
    coalesce(sum(total_price), 0)
  into v_cost, v_sale
  from public.quote_lines
  where quote_id = p_quote_id
    and deleted_at is null;

  select coalesce(discount_type, 'percentage'), coalesce(discount_value, discount_amount, 0)
  into v_discount_type, v_discount_value
  from public.quotes
  where id = p_quote_id;

  v_discount := least(case when v_discount_type = 'percentage' then v_sale * coalesce(v_discount_value, 0) / 100 else coalesce(v_discount_value, 0) end, v_sale);
  v_taxable := greatest(v_sale - coalesce(v_discount, 0), 0);

  select coalesce(sum(case when v_sale = 0 then 0 else greatest(total_price - (total_price / v_sale) * coalesce(v_discount, 0), 0) * tax_rate / 100 end), 0)
  into v_tax
  from public.quote_lines
  where quote_id = p_quote_id
    and deleted_at is null;

  update public.quotes
  set subtotal_cost = round(v_cost, 2),
      subtotal_sale = round(v_sale, 2),
      subtotal = round(v_sale, 2),
      discount_amount = round(coalesce(v_discount, 0), 2),
      taxable_base = round(v_taxable, 2),
      tax_amount = round(v_tax, 2),
      total = round(v_taxable + v_tax, 2),
      total_amount = round(v_taxable + v_tax, 2),
      estimated_margin = round(v_taxable - v_cost, 2),
      updated_at = now()
  where id = p_quote_id;
end;
$$;

revoke all on function public.dmp_recalculate_quote_totals(uuid) from public;
revoke all on function public.dmp_recalculate_quote_totals(uuid) from anon;
revoke all on function public.dmp_recalculate_quote_totals(uuid) from authenticated;

-- Los disparadores que invocan el recalculado se redefinen como SECURITY DEFINER:
-- el cuerpo del trigger se ejecuta como propietario y puede llamar a
-- dmp_recalculate_quote_totals (cuyo EXECUTE quedo restringido a PUBLIC/anon/
-- authenticated) cuando un rol de cliente edita lineas o el descuento. Solo se
-- declaran como funciones de disparo (returns trigger): no son RPC de cliente.
create or replace function public.dmp_quote_lines_recalculate_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.dmp_recalculate_quote_totals(coalesce(new.quote_id, old.quote_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists quote_lines_recalculate_trigger on public.quote_lines;
create trigger quote_lines_recalculate_trigger
  after insert or update or delete on public.quote_lines
  for each row execute function public.dmp_quote_lines_recalculate_trigger();

create or replace function public.dmp_quotes_recalculate_on_discount_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.dmp_recalculate_quote_totals(new.id);
  return new;
end;
$$;

drop trigger if exists quotes_recalculate_on_discount_trigger on public.quotes;
create trigger quotes_recalculate_on_discount_trigger
  after update of discount_type, discount_value on public.quotes
  for each row
  when (new.discount_type is distinct from old.discount_type or new.discount_value is distinct from old.discount_value)
  execute function public.dmp_quotes_recalculate_on_discount_trigger();

create or replace function public.dmp_quotes_status_guard_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Unica ruta admitida: el mecanismo seguro (nucleo dmp_quote_transition_apply, usado
  -- tambien por la RPC dmp_change_quote_status). Validacion y trazabilidad ya hechas ahi.
  if coalesce(current_setting('dmp.quote_status_change', true), '') = 'true' then
    return new;
  end if;

  raise exception 'estado: no se puede cambiar el estado del presupuesto directamente; usa la operacion segura de cambio de estado';
end;
$$;

drop trigger if exists quotes_status_guard_trigger on public.quotes;
create trigger quotes_status_guard_trigger
  before update of status on public.quotes
  for each row execute function public.dmp_quotes_status_guard_trigger();

-- ============================================================
-- QUO-08: guarda de superficie INSERT (cierre del bypass de integridad).
-- La politica INSERT de quotes (with check) solo valida company_id + rol; una llamada
-- directa con rol authenticated podia crear un presupuesto ya 'Aceptado', con
-- sent_at/sent_to_email, totales arbitrarios o ciclo de vida relleno. Este trigger
-- normaliza TODO new a nivel de datos y es INDEPENDIENTE del rol invocador (aplica
-- tambien a service_role: la integridad no depende de quien inserta).
--   - status: siempre 'Borrador'. El unico cambio valido posterior es el mecanismo
--     seguro (dmp_change_quote_status -> dmp_quote_transition_apply): un presupuesto
--     no puede NACER en otro estado.
--   - envio (sent_at/sent_to_email) y ciclo de vida (deleted_at/deleted_by/delete_reason):
--     server-managed, se neutralizan SIEMPRE.
--   - economicos calculados (subtotal_cost, subtotal_sale, subtotal, discount_amount,
--     taxable_base, tax_amount, total, total_amount, estimated_margin): a 0; los escribe
--     dmp_recalculate_quote_totals (SECURITY DEFINER) en cuanto se insertan lineas.
--   - updated_at: sello de servidor.
-- NO toca company_id (lo aporta quotesService.create() con currentCompanyId() y lo valida
-- la RLS with check), NO toca code (sigue la via trg_quotes_auto_code -> next_dmp_code de
-- 034) ni created_by (lo envia el servicio con currentProfileId()): el alta legitima no
-- necesita cambios y el trigger de codigo sigue funcionando.
-- ============================================================

create or replace function public.dmp_quote_insert_normalize_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.status := 'Borrador';

  new.sent_at := null;
  new.sent_to_email := null;
  new.deleted_at := null;
  new.deleted_by := null;
  new.delete_reason := null;

  new.subtotal_cost := 0;
  new.subtotal_sale := 0;
  new.subtotal := 0;
  new.discount_amount := 0;
  new.taxable_base := 0;
  new.tax_amount := 0;
  new.total := 0;
  new.total_amount := 0;
  new.estimated_margin := 0;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists quotes_insert_normalize_trigger on public.quotes;
create trigger quotes_insert_normalize_trigger
  before insert on public.quotes
  for each row execute function public.dmp_quote_insert_normalize_trigger();

-- ============================================================
-- QUO-01/02/06: nucleo unico de transicion de estado de presupuestos.
-- Contiene TODA la validacion server-side (estado->mismo estado protegido, matriz,
-- motivo obligatorio, envio con email) y TODA la trazabilidad (historial).
-- NO esta expuesto al cliente: solo otras funciones con definidor de seguridad lo invocan.
-- ============================================================

create or replace function public.dmp_quote_transition_apply(
  p_quote_id uuid,
  p_new_status text,
  p_reason text default null,
  p_sent_to_email text default null,
  p_actor uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.quotes;
  v_previous text;
  v_actor uuid := coalesce(p_actor, public.current_profile_id());
  v_reason text := trim(coalesce(p_reason, ''));
  v_forced_reason boolean := false;
begin
  if p_quote_id is null then raise exception 'estado: presupuesto no indicado'; end if;

  select * into v_quote from public.quotes where id = p_quote_id for update;
  if v_quote.id is null then raise exception 'presupuesto: presupuesto no encontrado'; end if;
  if v_quote.deleted_at is not null then raise exception 'presupuesto: el presupuesto esta archivado'; end if;

  p_new_status := case when p_new_status = 'Mandado' then 'Enviado' else p_new_status end;

  -- Impide transiciones estado -> mismo estado: nunca se genera un historial falso (p.ej. Aceptado -> Aceptado).
  if p_new_status is not distinct from v_quote.status then
    raise exception 'estado: el presupuesto ya se encuentra en el estado %', v_quote.status;
  end if;

  if not public.dmp_quote_status_transition_valid(v_quote.status, p_new_status, public.dmp_quote_has_generated_work_order(v_quote.id)) then
    raise exception 'estado: transicion de estado de presupuesto no permitida de % a %', v_quote.status, p_new_status;
  end if;

  if p_new_status in ('Aceptado','Ejecutado en cliente','Rechazado','Caducado','Cancelado') and v_reason = '' then
    raise exception 'estado: el motivo es obligatorio para este cambio de estado';
  end if;

  if p_new_status = 'Enviado' then
    if nullif(trim(coalesce(p_sent_to_email, '')), '') is null then
      raise exception 'envio: indica el email del cliente para marcar el presupuesto como enviado';
    end if;
    if position('@' in trim(p_sent_to_email)) = 0 or position('.' in trim(p_sent_to_email)) = 0 then
      raise exception 'envio: el email del cliente no es valido';
    end if;
  end if;

  if v_reason = '' then
    v_reason := 'Cambio de estado a ' || p_new_status;
    v_forced_reason := true;
  end if;

  v_previous := v_quote.status;

  -- Ruta autorizada para el trigger, en un sub-bloque que SIEMPRE restaura/limpia el
  -- marcador inmediatamente despues del UPDATE, incluso ante excepcion: si aqui se lanza
  -- una excepcion, se limpia el marcador y se relanza (nunca queda 'true' para sintaxis
  -- posterior del mismo/later contexto de la transaccion). Con is_local = true el valor
  -- va ligado al contexto local y ademas esta capa es defensa en profundidad: la CAPA 1
  -- de privilegio de columna ya impide el UPDATE directo desde PostgREST/anonymous/ROL de
  -- servicio SIN depender de este GUC.
  begin
    perform set_config('dmp.quote_status_change', 'true', true);

    update public.quotes
    set status = p_new_status,
        sent_at = case when p_new_status = 'Enviado' then coalesce(sent_at, now()) else sent_at end,
        sent_to_email = case when p_new_status = 'Enviado' then trim(p_sent_to_email) else sent_to_email end,
        updated_by = v_actor,
        updated_at = now()
    where id = v_quote.id
    returning to_jsonb(quotes.*) into v_quote;

    -- Limpieza inmediata: la ruta autorizada queda cerrada para el resto del trafico.
    perform set_config('dmp.quote_status_change', '', true);
  exception when others then
    perform set_config('dmp.quote_status_change', '', true);
    raise;
  end;

  insert into public.quote_status_history(company_id, quote_id, previous_status, new_status, changed_by, reason, manual_correction)
  values (v_quote.company_id, v_quote.id, v_previous, v_quote.status, v_actor, v_reason, v_forced_reason);

  return jsonb_build_object('id', v_quote.id, 'status', v_quote.status, 'sent_at', v_quote.sent_at, 'sent_to_email', v_quote.sent_to_email);
end;
$$;

-- Nucleo interno: no se concede a nadie fuera del propietario (solo se invoca desde
-- otras funciones con definidor de seguridad como la RPC y el cierre tecnico).
revoke all on function public.dmp_quote_transition_apply(uuid, text, text, text, uuid) from public;
revoke all on function public.dmp_quote_transition_apply(uuid, text, text, text, uuid) from anon;
revoke all on function public.dmp_quote_transition_apply(uuid, text, text, text, uuid) from authenticated;

-- ============================================================
-- QUO-01/06: RPC de cambio de estado expuesto al cliente.
-- Solo hace AUTORIZACION (empresa, rol, existencia) y delega el cambio en el nucleo;
-- no duplica validacion ni trazabilidad.
-- ============================================================

create or replace function public.dmp_change_quote_status(
  p_quote_id uuid,
  p_new_status text,
  p_reason text default null,
  p_sent_to_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_deleted_at timestamptz;
begin
  if p_quote_id is null then raise exception 'estado: presupuesto no indicado'; end if;

  select company_id, deleted_at into v_company_id, v_deleted_at
  from public.quotes where id = p_quote_id;
  if v_company_id is null then raise exception 'presupuesto: presupuesto no encontrado'; end if;
  if v_deleted_at is not null then raise exception 'presupuesto: el presupuesto esta archivado'; end if;

  if not public.is_platform_superadmin() then
    perform public.assert_member_of_current_company(v_company_id);
  end if;
  if not public.has_any_role(array['superadmin','Comercial','Gerencia','SAT','Oficina']) then
    raise exception 'permiso: no tienes permisos para cambiar el estado de presupuestos';
  end if;

  return public.dmp_quote_transition_apply(p_quote_id, p_new_status, p_reason, p_sent_to_email, public.current_profile_id());
end;
$$;

revoke all on function public.dmp_change_quote_status(uuid, text, text, text) from public;
revoke all on function public.dmp_change_quote_status(uuid, text, text, text) from anon;
grant execute on function public.dmp_change_quote_status(uuid, text, text, text) to authenticated;

-- ============================================================
-- QUO-01/02: redefinicion de dmp_finalize_work_order_technical (base = 045).
-- La transicion interna Aceptado -> 'Ejecutado en cliente' usaba un UPDATE directo que
-- solo pasaba la guarda por ser el propietario SQL. Ahora usa EXPLICITAMENTE el mecanismo
-- seguro (dmp_quote_transition_apply): no depende del propietario de la funcion y mantiene
-- la unica logica de validacion y trazabilidad en el nucleo.
-- ============================================================

create or replace function public.dmp_finalize_work_order_technical(p_work_order_id uuid, p_payload jsonb default '{}'::jsonb)
returns public.work_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp024_active_profile();
  v_work public.work_orders;
  v_old jsonb;
  v_can_operate boolean := false;
  v_real_cost numeric := 0;
  v_sale_amount numeric := 0;
  v_quote_sale numeric := null;
  v_material_cost numeric := 0;
  v_material_sale numeric := 0;
  v_time_cost numeric := 0;
  v_time_sale numeric := 0;
  v_aux_cost numeric := 0;
  v_aux_sale numeric := 0;
  v_billable boolean;
  v_warranty boolean;
  v_economic_status text;
  v_reason text := coalesce(nullif(trim(p_payload->>'reason'), ''), 'Cierre tecnico del parte');
begin
  select * into v_work from public.work_orders where id = p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado o archivado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  if v_work.status in ('Cerrado','Cancelado') then raise exception 'estado editable: el parte esta % y no permite cierre tecnico', v_work.status; end if;

  v_can_operate := public.has_any_role(array['superadmin','SAT','Gerencia','Oficina'])
    or (public.has_any_role(array['Tecnico']) and public.dmp024_is_work_order_active_status(v_work.status) and exists (
      select 1 from public.work_order_assignments a
      where a.work_order_id = v_work.id
        and a.technician_id = v_profile.id
        and a.deleted_at is null
        and a.status not in ('Finalizado','Cancelado')
    ))
    or (public.has_any_role(array['Comercial']) and public.dmp024_can_commercial_operate(v_work, v_profile));
  if not v_can_operate then raise exception 'permiso: no tienes permiso para finalizar tecnicamente este parte'; end if;

  v_old := to_jsonb(v_work);

  select
    round(coalesce(sum(coalesce(used_quantity, 0) * coalesce(unit_cost, unit_price, 0)), 0), 2),
    round(coalesce(sum(coalesce(used_quantity, 0) * coalesce(unit_price, 0)), 0), 2)
  into v_material_cost, v_material_sale
  from public.work_order_materials
  where company_id = v_work.company_id and work_order_id = v_work.id and deleted_at is null;

  select
    round(coalesce(sum(coalesce(total_cost, duration_minutes::numeric / 60 * coalesce(hourly_cost, 0))), 0), 2),
    round(coalesce(sum(coalesce(total_price, duration_minutes::numeric / 60 * coalesce(hourly_price, 0))), 0), 2)
  into v_time_cost, v_time_sale
  from public.work_order_time_entries
  where company_id = v_work.company_id and work_order_id = v_work.id;

  select
    round(coalesce(sum(coalesce(total_cost, quantity * coalesce(unit_cost, 0))), 0), 2),
    round(coalesce(sum(coalesce(total_price, quantity * coalesce(unit_price, 0))), 0), 2)
  into v_aux_cost, v_aux_sale
  from public.work_order_cost_entries
  where company_id = v_work.company_id and work_order_id = v_work.id and deleted_at is null;

  select round(coalesce(taxable_base, subtotal_sale, subtotal, 0), 2)
  into v_quote_sale
  from public.quotes
  where company_id = v_work.company_id
    and deleted_at is null
    and status in ('Aceptado','Ejecutado en cliente')
    and (id = v_work.quote_id or work_order_id = v_work.id)
  order by case when id = v_work.quote_id then 0 else 1 end, issue_date desc nulls last, created_at desc nulls last, id desc
  limit 1;

  v_real_cost := round(coalesce(v_material_cost, 0) + coalesce(v_time_cost, 0) + coalesce(v_aux_cost, 0), 2);
  v_warranty := case when p_payload ? 'warranty' then coalesce((p_payload->>'warranty')::boolean, false) else coalesce(v_work.warranty, false) or v_work.type = 'Garantia' end;
  v_billable := case when p_payload ? 'billable' then coalesce((p_payload->>'billable')::boolean, true) else coalesce(v_work.billable, true) end;
  if v_warranty then v_billable := false; end if;
  v_economic_status := case when v_warranty then 'garantia' when not v_billable then 'no_facturable' else 'pendiente_facturar' end;
  v_sale_amount := case
    when v_economic_status in ('garantia','no_facturable') then 0
    else round(coalesce(nullif(p_payload->>'estimated_sale_amount', '')::numeric, nullif(v_work.estimated_sale_amount, 0), v_quote_sale, coalesce(v_material_sale, 0) + coalesce(v_time_sale, 0) + coalesce(v_aux_sale, 0), 0), 2)
  end;

  update public.work_orders
  set status = 'Finalizado tecnicamente',
      economic_status = v_economic_status,
      billable = v_billable,
      warranty = v_warranty,
      real_cost_amount = v_real_cost,
      estimated_sale_amount = v_sale_amount,
      estimated_margin_amount = case when v_economic_status in ('garantia','no_facturable') then 0 else round(v_sale_amount - v_real_cost, 2) end,
      finished_at = coalesce(finished_at, now()),
      sent_at = null,
      updated_by = v_profile.id,
      updated_at = now()
  where id = v_work.id
  returning * into v_work;

  update public.work_order_assignments
  set status = 'Finalizado', updated_at = now()
  where work_order_id = v_work.id and deleted_at is null and status not in ('Finalizado','Cancelado');

  if v_old->>'status' is distinct from v_work.status then
    insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason, manual_correction)
    values (v_work.company_id, v_work.id, v_old->>'status', v_work.status, v_profile.id, v_reason, false);
  end if;

  -- Transicion del presupuesto via el mecanismo seguro: validacion y trazabilidad en el nucleo.
  -- Solo se aplica si el presupuesto esta Aceptado (igual que hacia el UPDATE condicional de 045).
  if v_work.quote_id is not null
     and exists (select 1 from public.quotes where id = v_work.quote_id and deleted_at is null and status = 'Aceptado') then
    perform public.dmp_quote_transition_apply(v_work.quote_id, 'Ejecutado en cliente', v_reason, null, v_profile.id);
    update public.quotes
    set work_order_id = coalesce(work_order_id, v_work.id)
    where id = v_work.quote_id;
  end if;

  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)
  values (v_work.company_id, 'work_orders', v_work.id, 'TECHNICAL_FINALIZE', v_profile.id, v_old, jsonb_build_object('status', v_work.status, 'economic_status', v_work.economic_status, 'real_cost_amount', v_work.real_cost_amount, 'estimated_sale_amount', v_work.estimated_sale_amount, 'estimated_margin_amount', v_work.estimated_margin_amount, 'reason', v_reason));

  return v_work;
end;
$$;

revoke all on function public.dmp_finalize_work_order_technical(uuid, jsonb) from public;
revoke all on function public.dmp_finalize_work_order_technical(uuid, jsonb) from anon;
grant execute on function public.dmp_finalize_work_order_technical(uuid, jsonb) to authenticated;

-- ============================================================
-- QUO-03/10: position de lineas = max(position)+1 con advisory lock.
-- No depende de "lineas activas + 1" ni de frontend.
-- ============================================================

create or replace function public.dmp_quote_lines_position_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.position is null or new.position <= 0 then
    perform pg_advisory_xact_lock(hashtextextended(new.quote_id::text, 0));
    select coalesce(max(position), 0) + 1 into new.position
    from public.quote_lines
    where quote_id = new.quote_id;
  end if;
  return new;
end;
$$;

drop trigger if exists quote_lines_position_trigger on public.quote_lines;
create trigger quote_lines_position_trigger
  before insert on public.quote_lines
  for each row execute function public.dmp_quote_lines_position_trigger();

-- ============================================================
-- QUO-04: discount_percent por linea aplicado de verdad.
-- total_price = quantity * unit_price * (1 - discount_percent/100).
-- El descuento GLOBAL del presupuesto se aplica despues sobre la suma ya descontada.
-- ============================================================

create or replace function public.dmp_quote_lines_set_totals_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.quantity := coalesce(new.quantity, 1);
  new.unit_cost := coalesce(new.unit_cost, 0);
  new.unit_price := coalesce(new.unit_price, 0);
  new.tax_rate := coalesce(new.tax_rate, 21);
  new.discount_percent := coalesce(new.discount_percent, 0);
  if new.discount_percent < 0 or new.discount_percent > 100 then
    raise exception 'validacion del formulario: el descuento de la linea debe estar entre 0 y 100';
  end if;
  new.total_cost := round(new.quantity * new.unit_cost, 2);
  new.total_price := round(new.quantity * new.unit_price * (1 - new.discount_percent / 100), 2);
  new.total := new.total_price;
  new.updated_at := now();
  return new;
end;
$$;

-- Backfill CONSERVADOR: solo presupuestos en estados editables (Borrador/Enviado) y solo
-- lineas no eliminadas cuyo total recalculado difiere del almacenado. La formula se aplica
-- HACIA DELANTE via el trigger (inserts/updates); los historicos de presupuestos en estados
-- terminales (Aceptado, Ejecutado en cliente, Rechazado, Caducado, Cancelado) NO se tocan:
-- recalcular importes historicos por comodidad no es seguro ni necesario.
-- Los snapshots (unit_cost/unit_price/tax_rate) quedan intactos exactamente igual que antes.
update public.quote_lines ql
set total_cost = round(coalesce(ql.quantity, 0) * coalesce(ql.unit_cost, 0), 2),
    total_price = round(coalesce(ql.quantity, 0) * coalesce(ql.unit_price, 0) * (1 - coalesce(ql.discount_percent, 0) / 100), 2),
    total = round(coalesce(ql.quantity, 0) * coalesce(ql.unit_price, 0) * (1 - coalesce(ql.discount_percent, 0) / 100), 2),
    updated_at = now()
from public.quotes q
where ql.quote_id = q.id
  and q.deleted_at is null
  and q.status in ('Borrador','Enviado')
  and ql.deleted_at is null
  and (
    ql.total_cost is distinct from round(coalesce(ql.quantity, 0) * coalesce(ql.unit_cost, 0), 2)
    or ql.total_price is distinct from round(coalesce(ql.quantity, 0) * coalesce(ql.unit_price, 0) * (1 - coalesce(ql.discount_percent, 0) / 100), 2)
    or ql.total is distinct from round(coalesce(ql.quantity, 0) * coalesce(ql.unit_price, 0) * (1 - coalesce(ql.discount_percent, 0) / 100), 2)
  );

-- ============================================================
-- QUO-05: garantia server-side de 1 presupuesto -> 1 parte.
-- ============================================================

-- Preflight READ-ONLY: detecta presupuestos con mas de un parte activo antes de crear
-- el indice unico. NO modifica, NO borra y NO reasigna ningun dato: solo informa y aborta
-- la migracion. La resolucion de presupuestos duplicados queda fuera del alcance de 053.
do $$
declare
  v_duplicates integer;
begin
  select count(*) into v_duplicates
  from (
    select quote_id
    from public.work_orders
    where quote_id is not null and deleted_at is null
    group by quote_id
    having count(*) > 1
  ) duplicados;
  if v_duplicates > 0 then
    raise exception 'integridad: hay % presupuesto(s) con mas de un parte activo y el indice unico (1 presupuesto -> 1 parte) no se puede crear. No se ha modificado ningun dato: revisa manualmente esos presupuestos antes de actualizar.', v_duplicates;
  end if;
end;
$$;

create unique index if not exists work_orders_single_quote_unique
  on public.work_orders(quote_id)
  where quote_id is not null and deleted_at is null;

create or replace function public.create_work_order_full(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := (p_payload->>'company_id')::uuid;
  v_created_by uuid := (p_payload->>'created_by')::uuid;
  v_client_id uuid := (p_payload->>'client_id')::uuid;
  v_site_id uuid := nullif(p_payload->>'site_id', '')::uuid;
  v_equipment_id uuid := nullif(p_payload->>'main_equipment_id', '')::uuid;
  v_technician_id uuid := nullif(p_payload->>'technician_id', '')::uuid;
  v_quote_id uuid := nullif(p_payload->>'quote_id', '')::uuid;
  v_case_id uuid := nullif(p_payload->>'case_id', '')::uuid;
  v_quote public.quotes;
  v_installation jsonb := coalesce(p_payload->'installation_equipment', '{}'::jsonb);
  v_equipment_type_id uuid := nullif(v_installation->>'equipment_type_id', '')::uuid;
  v_template_id uuid;
  v_check_id uuid;
  v_id uuid;
  v_code text;
  v_equipment_code text;
  v_check_code text;
begin
  if v_company_id is null then raise exception 'validacion del formulario: presupuesto sin empresa'; end if;
  if v_client_id is null then raise exception 'validacion del formulario: presupuesto sin cliente'; end if;
  if v_site_id is null then raise exception 'validacion del formulario: presupuesto sin centro para crear parte'; end if;
  if not public.is_platform_superadmin() then perform public.assert_member_of_current_company(v_company_id); end if;
  if v_created_by is null or v_created_by <> public.current_profile_id() then raise exception 'perfil activo: creador no valido'; end if;
  if not public.has_any_role(array['superadmin','SAT','Comercial','Gerencia','Oficina']) then raise exception 'permiso: no tienes permisos para crear partes'; end if;
  if not exists (select 1 from public.clients where id = v_client_id and company_id = v_company_id and deleted_at is null) then raise exception 'empresa: cliente no valido'; end if;
  if not exists (select 1 from public.sites where id = v_site_id and company_id = v_company_id and client_id = v_client_id and deleted_at is null) then raise exception 'empresa: centro no valido'; end if;
  if v_case_id is not null and not exists (select 1 from public.cases where id = v_case_id and company_id = v_company_id and client_id = v_client_id and (site_id is null or site_id = v_site_id) and deleted_at is null) then raise exception 'empresa: expediente no valido'; end if;
  if v_quote_id is not null then
    select * into v_quote from public.quotes where id = v_quote_id and deleted_at is null;
    if v_quote.id is null then raise exception 'presupuesto: presupuesto no valido'; end if;
    if v_quote.company_id <> v_company_id or v_quote.client_id <> v_client_id then raise exception 'presupuesto: no pertenece a la empresa o cliente del parte'; end if;
    if v_quote.site_id is not null and v_quote.site_id is distinct from v_site_id then raise exception 'presupuesto: centro no coincide con el presupuesto'; end if;
    if v_quote.equipment_id is not null and v_quote.equipment_id is distinct from v_equipment_id then raise exception 'presupuesto: equipo no coincide con el presupuesto'; end if;
    if v_quote.case_id is not null and v_quote.case_id is distinct from v_case_id then raise exception 'presupuesto: expediente no coincide con el presupuesto'; end if;
    if lower(coalesce(v_quote.status, '')) not in ('aceptado','ejecutado en cliente') then raise exception 'validacion del formulario: presupuesto no aceptado para generar parte'; end if;
    if public.dmp_quote_has_generated_work_order(v_quote.id) then raise exception 'presupuesto: el presupuesto ya tiene un parte generado'; end if;
  end if;

  if v_equipment_id is not null and not exists (select 1 from public.equipment where id = v_equipment_id and company_id = v_company_id and client_id = v_client_id and site_id = v_site_id and deleted_at is null) then raise exception 'empresa: equipo no valido'; end if;

  if v_equipment_id is null and coalesce(nullif(p_payload->>'type', ''), 'Correctivo') = 'Instalacion' then
    if v_equipment_type_id is null then raise exception 'validacion del formulario: falta tipo de equipo para el parte de instalacion'; end if;
    if not exists (select 1 from public.equipment_types where id = v_equipment_type_id and active = true and (company_id = v_company_id or company_id is null)) then raise exception 'empresa: tipo de equipo no valido'; end if;
    select id into v_template_id
    from public.check_templates
    where active = true
      and (company_id = v_company_id or company_id is null)
      and equipment_type_id = v_equipment_type_id
      and (lower(name) like '%instal%' or lower(name) like '%puesta en marcha%')
    order by company_id nulls last, updated_at desc, created_at desc
    limit 1;
    if v_template_id is null then raise exception 'validacion del formulario: no existe una plantilla activa de check de instalacion para este tipo de equipo'; end if;
    v_equipment_code := public.next_dmp_code(v_company_id, 'equipment', public.dmp_equipment_code_prefix(v_equipment_type_id), false, 6);
    insert into public.equipment(company_id, code, client_id, site_id, equipment_type_id, brand, model, serial_number, installation_date, internal_location, status, criticality, notes)
    values (v_company_id, v_equipment_code, v_client_id, v_site_id, v_equipment_type_id, nullif(v_installation->>'brand', ''), nullif(v_installation->>'model', ''), nullif(v_installation->>'serial_number', ''), coalesce(nullif(v_installation->>'installation_date', '')::date, current_date), nullif(v_installation->>'internal_location', ''), 'Operativo', coalesce(nullif(v_installation->>'criticality', ''), 'Media'), nullif(v_installation->>'notes', ''))
    returning id into v_equipment_id;
  end if;

  v_code := public.next_dmp_code(v_company_id, 'work_orders', 'PAR', true, 6);
  insert into public.work_orders(company_id, code, case_id, quote_id, client_id, site_id, main_equipment_id, title, description, type, priority, origin, scheduled_date, scheduled_time, estimated_duration_minutes, contact_id, access_requirement_id, planned_material, created_by, created_role, updated_by, current_responsible_id)
  values (v_company_id, v_code, v_case_id, v_quote_id, v_client_id, v_site_id, v_equipment_id, coalesce(nullif(p_payload->>'title', ''), 'Parte generado desde presupuesto'), nullif(p_payload->>'description', ''), coalesce(nullif(p_payload->>'type', ''), 'Correctivo'), coalesce(nullif(p_payload->>'priority', ''), 'Normal'), coalesce(nullif(p_payload->>'origin', ''), 'Comercial'), nullif(p_payload->>'scheduled_date', '')::date, nullif(p_payload->>'scheduled_time', '')::time, nullif(p_payload->>'estimated_duration_minutes', '')::integer, nullif(p_payload->>'contact_id', '')::uuid, nullif(p_payload->>'access_requirement_id', '')::uuid, nullif(p_payload->>'planned_material', ''), v_created_by, p_payload->>'created_role', v_created_by, coalesce(v_technician_id, v_created_by))
  returning id into v_id;

  if v_technician_id is not null then
    perform public.assign_technician(v_id, v_technician_id, coalesce(nullif(p_payload->>'scheduled_date', '')::date, current_date), nullif(p_payload->>'scheduled_time', '')::time, null, 'Principal', v_created_by);
  end if;
  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason)
  values (v_company_id, v_id, null, 'Pendiente', v_created_by, 'Creacion transaccional de parte ' || v_code);

  if v_template_id is not null then
    v_check_code := public.next_dmp_code(v_company_id, 'checks', 'CHK', true, 6);
    insert into public.checks(company_id, code, work_order_id, equipment_id, template_id, technician_id)
    values (v_company_id, v_check_code, v_id, v_equipment_id, v_template_id, coalesce(v_technician_id, v_created_by))
    returning id into v_check_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_work_order_full(jsonb) from public;
revoke all on function public.create_work_order_full(jsonb) from anon;
grant execute on function public.create_work_order_full(jsonb) to authenticated;

commit;
