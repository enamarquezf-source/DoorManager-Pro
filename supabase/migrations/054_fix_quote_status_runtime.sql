-- DoorManager Pro - corrige runtime de cambios de estado de presupuestos.
-- Idempotente. Redefine dmp_quote_transition_apply partiendo EXACTAMENTE de la
-- version efectiva de 053 cambiando UNICAMENTE el RETURNING del UPDATE por la fila:
--   ANTES (053): el RETURNING devolvia jsonb y se asignaba al composite v_quote.
--   DESPUES (054): returning * into v_quote (fila completa, tipos compatibles).
-- v_quote esta declarado como composite public.quotes; asignarle una unica columna
-- jsonb lanza en runtime:
--   ERROR:  number of source and target fields in a record must match
-- lo que hacia fallar CUALQUIER transicion de estado (Borrador->Enviado, etc.).
-- No se modifica nada mas: matriz de transiciones, motivos, email de envio, GUC
-- (dmp.quote_status_change), historial, permisos ni RLS conservan la version de 053.

begin;

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
    returning * into v_quote;

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

-- Nucleo interno: no se concede a nadie fuera del propietario (misma superficie que 053).
revoke all on function public.dmp_quote_transition_apply(uuid, text, text, text, uuid) from public;
revoke all on function public.dmp_quote_transition_apply(uuid, text, text, text, uuid) from anon;
revoke all on function public.dmp_quote_transition_apply(uuid, text, text, text, uuid) from authenticated;

commit;