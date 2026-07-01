# DoorManager Pro - Esquema inicial de base de datos

Este documento describe la primera migracion SQL de DoorManager Pro para Supabase/PostgreSQL.

Archivos generados:

- `supabase/migrations/001_initial_dmp_schema.sql`
- `supabase/seed.sql`
- `docs/DATABASE_SCHEMA.md`

No se crean usuarios reales en `auth.users`. Los perfiles quedan preparados con `auth_user_id nullable` para enlazarlos mas adelante con Supabase Auth.

## Principios

- PostgreSQL compatible con Supabase.
- Claves primarias UUID con `gen_random_uuid()`.
- `created_at`, `updated_at` y `deleted_at` en entidades operativas principales.
- Modelo preparado para multiempresa mediante `company_id`.
- Relaciones importantes mediante claves foraneas, no solo JSON.
- `jsonb` reservado para configuracion tecnica, metadatos y datos variables.
- RLS activada en tablas operativas, con politicas preparadas para `auth.uid()`.
- Archivos y fotografias guardan metadatos; los binarios se dejan para Supabase Storage.

## Entidades Principales

Empresas, usuarios y roles:

- `companies`: empresa propietaria de datos.
- `profiles`: usuarios funcionales de DMP, aun sin crear cuentas en `auth.users`.
- `roles`: catalogo de roles SAT, Comercial, Oficina, Gerencia y Tecnico.
- `profile_roles`: relacion N:M para multiples roles por perfil.

Clientes y centros:

- `clients`: cliente juridico/comercial.
- `client_contacts`: contactos del cliente.
- `sites`: centros, naves, tiendas o parkings del cliente.
- `site_contacts`: contactos especificos por centro.
- `access_requirements`: requisitos de acceso, PRL y cita.

Equipos:

- `equipment_types`: tipos como puerta seccional industrial, barrera o muelle.
- `equipment`: activo tecnico instalado en un centro.
- `equipment_components`: motor, cuadro, fotocelulas, banda, activacion u otros.
- `equipment_status_history`: historial de estado del equipo.
- `equipment_photos`: vinculo entre equipo y archivo fotografico.

Expedientes:

- `cases`: expediente agregador por averia, mantenimiento, inspeccion, garantia, reclamacion, mejora, obra o comercial.
- `case_events`: eventos internos del expediente.
- `case_links`: enlaces genericos a equipos, partes, checks, avisos, documentos, presupuestos, incidencias u oportunidades.
- `case_documents`: documentos propios del expediente.

Partes y trabajos:

- `work_orders`: parte de trabajo operativo.
- `work_order_equipment`: equipos afectados por un parte.
- `work_order_assignments`: planificacion por tecnico y jornada.
- `work_order_status_history`: historial completo de estados, motivo, usuario, ubicacion y correccion manual.
- `work_order_notes`: notas internas, tecnicas, comerciales o visibles a cliente.
- `work_order_photos`: fotos del parte.
- `work_order_signatures`: firmas de aceptacion o recepcion.

Checks:

- `check_templates`: plantilla versionada por tipo de equipo.
- `check_template_sections`: secciones de plantilla.
- `check_template_items`: componentes/elementos revisables.
- `checks`: ejecucion de check asociada a parte, equipo, tecnico y plantilla.
- `check_section_results`: resultado por seccion.
- `check_item_results`: resultado por item.
- `check_photos`: fotos vinculadas al check o item.

Deficiencias:

- `deficiencies`: problema detectado en check/parte/equipo, con gravedad, responsable y vencimiento.
- `corrective_actions`: acciones correctivas asociadas.

Avisos:

- `alerts`: aviso operativo, tecnico, comercial, administrativo, PRL, material, documentacion o critico.
- `alert_recipients`: destinatarios por perfil o rol, con lectura y cierre.

Documentacion y archivos:

- `files`: metadatos de Supabase Storage (`bucket`, `path`, nombre, MIME, tamano, usuario y fecha).
- `documents`: documento funcional con tipo, version, vigencia, origen, URL o archivo.
- `document_links`: vinculos a cliente, centro, equipo, tipo, marca, modelo, motor, cuadro, expediente, parte o check.

Materiales y almacen:

- `suppliers`: proveedores.
- `materials`: catalogo de materiales con coste, precio y stock minimo.
- `warehouses`: almacenes.
- `warehouse_stock`: stock por almacen/material.
- `stock_movements`: entradas, salidas, reservas, devoluciones, ajustes y consumos en parte.
- `material_requests`: solicitudes de material.
- `work_order_materials`: materiales previstos o consumidos por parte.

Comercial:

- `opportunities`: oportunidad por visita, deficiencia, check, parte, cliente o renovacion.
- `quotes`: presupuesto basico.
- `quote_lines`: lineas de presupuesto.

Auditoria:

- `activity_log`: actividad funcional legible para usuarios.
- `audit_log`: registro tecnico de cambios importantes.

## Flujo SAT Cubierto

El seed incluye el flujo completo:

`Logistica Ares SL -> Nave Norte -> EQ-SEC-001 -> EXP-ARES-AV-001 -> PAR-ARES-001 -> Diego Martin -> CHK-ARES-001 -> DEF-ARES-001 -> AVI-ARES-001 -> OPO-ARES-001 -> PRE-ARES-001`.

Este flujo permite probar:

- Creacion y seguimiento de expediente.
- Parte urgente asignado a tecnico.
- Planificacion de jornada.
- Check de puerta seccional industrial.
- Deficiencia tecnica con fotografia.
- Aviso a SAT.
- Oportunidad comercial generada desde deficiencia.
- Presupuesto basico con lineas de material y mano de obra.

## Permisos y Roles

Roles iniciales:

- `SAT`: crea, edita, asigna y gestiona partes.
- `Comercial`: crea partes y edita origen/informacion comercial.
- `Oficina`: consulta y completa informacion administrativa.
- `Gerencia`: crea, edita y supervisa cualquier parte.
- `Tecnico`: actualiza la ejecucion tecnica de partes asignados.

Los campos `created_by`, `created_role`, `updated_by`, `origin` y `current_responsible_id` quedan en `work_orders` para trazabilidad y control posterior.

RLS esta activada. Las politicas iniciales limitan datos por `company_id = current_company_id()` usando `auth.uid()`. En desarrollo sin usuarios de Auth, las migraciones y seeds deben ejecutarse con rol propietario/local de Supabase. No hay politica publica de escritura anonima.

## Codigos

Convenciones usadas en seed:

- Clientes: `CLI-...`
- Centros: `CEN-...`
- Equipos: `EQ-...`
- Expedientes: `EXP-...`
- Partes: `PAR-...`
- Checks: `CHK-...`
- Avisos: `AVI-...`
- Presupuestos: `PRE-...`

Las RPC que generan partes usan `PAR-YYYYMMDDHH24MISS-XXXX` como codigo temporal. En una migracion posterior conviene crear secuencias por empresa y prefijo.

## Estados Principales

Partes:

- Pendiente
- Trabajo descargado
- En desplazamiento
- En intervencion
- Pausado
- Pendiente de material
- Finalizado tecnicamente
- Pendiente de envio
- Enviado
- Devolucion solicitada
- Devuelto por SAT
- Cerrado
- Cancelado

Checks:

- Por realizar
- En curso
- Realizado
- Cancelado

Resultados de check:

- Sin revisar
- Todo favorable
- Problema leve
- No favorable
- Favorable tras intervencion
- No aplicable

Deficiencias:

- Detectada
- Pendiente de valoracion
- En valoracion
- Presupuestada
- Aceptada
- Rechazada
- Corregida
- Cerrada

## Vistas

- `v_technician_daily_schedule`: jornada por tecnico con parte, cliente, centro y equipo.
- `v_open_work_orders`: partes no cerrados ni cancelados.
- `v_work_order_full_detail`: detalle agregado de parte.
- `v_equipment_history`: historial unificado de estados, partes, checks y deficiencias.
- `v_pending_checks`: checks pendientes o en curso.
- `v_completed_checks`: checks realizados.
- `v_unread_alerts`: avisos no leidos por destinatario o rol.
- `v_sat_dashboard`: contadores operativos SAT.
- `v_management_metrics`: metricas de clientes, equipos, partes y presupuestos.

## Funciones RPC

- `create_work_order(...)`: crea parte y primer estado.
- `assign_technician(...)`: asigna tecnico, actualiza tecnico principal si procede y registra actividad.
- `change_work_order_status(...)`: valida estado, actualiza parte y registra historial.
- `request_work_order_return(...)`: solicita devolucion e impide duplicados activos.
- `finish_check(...)`: marca check como realizado y valida resultado global.
- `create_deficiency_from_check(...)`: crea deficiencia desde check e item.
- `mark_alert_as_read(...)`: marca aviso como leido para el destinatario.

## Datos Semilla

El seed crea:

- 1 empresa demo.
- 10 perfiles, incluyendo los 5 usuarios demo pedidos y 6 tecnicos en total.
- 5 roles.
- 5 clientes y 6 centros.
- 9 tipos de equipo.
- 12 equipos.
- Expedientes, partes en varios estados, asignaciones, checks pendientes/realizados, deficiencias, avisos, documentos, materiales, stock, oportunidades y presupuestos.

Todos los datos son ficticios y usan correos/dominios `.test`.

## Ejecucion En Supabase

Orden exacto:

1. Aplicar migraciones con Supabase CLI: `supabase db reset` en entorno local, o `supabase migration up` segun flujo del proyecto.
2. Ejecutar seed local: `supabase db reset` si el CLI esta configurado para cargar `supabase/seed.sql`, o ejecutar el contenido de `supabase/seed.sql` contra la base local.
3. Verificar vistas: consultar `v_sat_dashboard`, `v_technician_daily_schedule` y `v_work_order_full_detail`.

No ejecutar estos scripts contra produccion sin revisar RLS, roles reales y estrategia de backups.

## Revertir En Desarrollo

Para entorno local desechable:

1. `supabase db reset` para reconstruir desde cero.
2. Si se aplico manualmente, eliminar el esquema `public` y recrearlo solo en una base local de desarrollo.

No usar borrados destructivos en bases compartidas sin backup.

## Pendiente Para Migraciones Posteriores

- Enlazar `profiles.auth_user_id` con usuarios reales de Supabase Auth.
- Ajustar politicas RLS por rol con reglas especificas para SAT, Comercial, Oficina, Gerencia y Tecnico.
- Crear secuencias numericas por empresa para codigos de parte, expediente, check, aviso y presupuesto.
- Automatizar `audit_log` con triggers por tabla si se requiere auditoria completa de cambios.
- Normalizar catalogos avanzados si se quieren administrar estados/tipos desde UI.
- Anadir facturacion, contratos, SLA y mantenimiento preventivo recurrente.
- Integrar Supabase Storage y politicas de buckets.
- Implementar validaciones cruzadas cliente-centro-equipo mediante triggers si se necesita consistencia estricta.
