# Auditoria de seguridad y eliminacion

Fecha: 2026-08-09

## Estado inicial

- Rama Git: `main`.
- Arbol de trabajo inicial: limpio.
- Aplicacion: React/Vite con Supabase.
- Migraciones existentes: `001` a `021`, con prefijo `018` duplicado en tres archivos.
- Auditorias revisadas: `AUDITORIA_ESTABILIDAD_PANTALLAS.md` y `AUDITORIA_UX_FUNCIONAL_FINAL.md`.
- No se ejecuto SQL contra Supabase ni contra produccion.

## Riesgos confirmados

- No existia una capa central de archivo, restauracion y borrado definitivo.
- La mayor parte de listados ocultaba `deleted_at`, pero no permitia consultar archivados.
- Existian comprobaciones de permisos dispersas y sin funciones de ciclo de vida.
- `audit_log` existia, pero no habia trazabilidad general de operaciones de ciclo de vida.
- Varios RPC `SECURITY DEFINER` antiguos concedian `authenticated` sin `REVOKE` explicito de `PUBLIC/anon`.
- La migracion `020_check_sync_end_to_end.sql` contiene un riesgo semantico: `register_work_order_deficiency` referencia `v_component` sin declararlo. La migracion `022` redefine la funcion corregida, con `v_component` declarado y privilegios explicitos.
- La primera version de `022` permitia que SAT/Gerencia invocaran ciclo de vida de `profiles`; queda corregido en RPC: solo `is_platform_superadmin()` puede operar perfiles.
- La version correctiva bloquea archivados repetidos y restauraciones de registros no archivados bajo `FOR UPDATE`, antes de auditar, para no sobrescribir el estado original usado en restauracion.
- Preflight real previo a aplicar `022`: `TABLAS_FALTANTES=0`, `COLUMNAS_FALTANTES=0`, `RPC_CON_EXECUTE_ANON=6`. Las funciones expuestas eran `create_deficiency_from_check`, `finish_check_safe`, `register_work_order_deficiency`, `request_work_order_return`, `superadmin_update_profile` y `sync_work_order_material_usage` con sus firmas frontend actuales.

## Riesgos descartados

- No se encontro `service_role` en frontend.
- No se desactivo RLS.
- No se concedieron permisos globales a `authenticated` para tablas.
- Las asignaciones ya estaban endurecidas en `021` con soft delete y revokes explicitos.

## Diferencia entre archivar y borrar

- Archivar/desactivar conserva relaciones, historial y auditoria. Usa `deleted_at`, `active` o `status` segun la entidad real.
- Restaurar revierte el mecanismo real desde `audit_log.old_data`, valida padres activos cuando aplica y falla si el registro no esta archivado.
- Eliminar definitivamente se permite si Supabase recalcula cero dependencias bloqueantes dentro de RPC y la confirmacion coincide con `ELIMINAR <codigo>`. En partes y checks, la migracion `023` permite cascada controlada de dependencias operativas propias, siempre bloqueando referencias externas como `stock_movements`.
- Usuarios: no se borran cuentas Auth desde navegador; se desactiva el perfil DMP.

## Matriz de permisos

| Rol | Archivar | Restaurar | Borrar definitivamente | Alcance |
|---|---:|---:|---:|---|
| SAT | Si, excepto usuarios | Si, excepto usuarios | Si, solo sin dependencias y excepto usuarios | Su empresa |
| Gerencia | Si, excepto usuarios | Si, excepto usuarios | Si, solo sin dependencias y excepto usuarios | Su empresa |
| Superadmin empresa | Si | Si | Si, solo sin dependencias | Su empresa |
| Propietario global DMP | Si | Si | Si, solo sin dependencias | Backend: `is_platform_superadmin()`. Frontend: workspace `superadmin` + empresa seleccionada real |
| Tecnico | No | No | No | Bloqueado |
| Comercial | No | No | No | Bloqueado |
| Oficina | No | No | No | Bloqueado en esta fase |
| Usuario inactivo | No | No | No | Bloqueado |
| anon | No | No | No | Sin `EXECUTE` |

## Matriz por entidad

| Entidad | Mecanismo | Restauracion | Borrado definitivo |
|---|---|---|---|
| Clientes | `deleted_at`, `status=Inactivo` | Permitida | Bloqueado con contactos, centros, equipos, expedientes, partes, deficiencias o documentos |
| Centros | `deleted_at`, `active=false` | Bloqueada si cliente sigue archivado | Bloqueado con contactos, equipos, expedientes, partes, checks, deficiencias o documentos |
| Equipos | `deleted_at`, `status` compatible | Bloqueada si cliente o centro siguen archivados | Bloqueado con componentes, historial, fotos, partes, checks, deficiencias o documentos |
| Expedientes | `deleted_at`, `status=Cancelado` cuando aplica | Bloqueada si cliente o centro siguen archivados | Bloqueado con eventos, vinculos, documentos, partes, oportunidades o presupuestos |
| Partes | `deleted_at`, `status=Cancelado` cuando aplica | Bloqueada si cliente, centro o equipo principal siguen archivados | `023` permite cascada controlada de asignaciones, historial, notas, materiales, fotos, firmas, checks y deficiencias propias. Bloquea documentos y movimientos de stock. |
| Checks | `deleted_at`, `status=Cancelado` cuando aplica | Bloqueada si equipo o parte siguen archivados | `023` permite cascada controlada de resultados y fotos propias. Bloquea deficiencias si no se borran desde el parte. |
| Plantillas | `active=false` | Permitida | Bloqueado si fue usada o tiene estructura asociada |
| Usuarios | `active=false`, `deleted_at` | Solo propietario global/superadmin autorizado; nunca self-disable | No permitido desde navegador |

## Politicas RLS revisadas

- Se revisaron `clients_select_business`, `sites_select_business`, `equipment_select_business`, `work_orders_select_by_role`, `checks_select_by_role` y politicas de plataforma global.
- La migracion `022` recrea politicas de lectura de archivados para roles autorizados sin abrir acceso a Tecnico, Comercial u Oficina sobre archivados.
- Tecnicos mantienen acceso operativo solo a registros activos asignados.

## RPC revisadas

- `finish_check_safe`: valida check, empresa, rol/asignacion y secciones sincronizadas; pendiente endurecer `REVOKE` historico fuera de esta fase.
- `request_work_order_return`: version endurecida valida perfil, empresa, rol/asignacion y duplicados.
- `create_deficiency_from_check`: version endurecida valida perfil, empresa, check, item y equipo.
- `sync_work_order_material_usage`: valida empresa, rol/asignacion e idempotencia local.
- RPC de asignacion `assign_technician`, `unassign_work_order_profile`, `manage_work_order_assignments`: endurecidos en `021` con `REVOKE` a `public/anon`.
- Nuevos RPC `022`: `dmp_lifecycle_dependencies`, `dmp_archive_entity`, `dmp_restore_entity`, `dmp_permanently_delete_entity`.
- Nuevos helpers `022`: `dmp_previous_lifecycle_value` para restauracion fiel desde `audit_log.old_data` y `dmp_assert_profile_lifecycle_target` para proteger perfiles privilegiados.
- `register_work_order_deficiency`: redefinida en `022` para declarar `v_component`, validar perfil activo y revocar `PUBLIC/anon`.
- RPC criticas frontend: `022` revoca `EXECUTE` de `PUBLIC` y `anon` con firmas exactas, y mantiene `EXECUTE` solo para `authenticated` en `create_deficiency_from_check(uuid, uuid, text, text, text, uuid)`, `finish_check_safe(uuid, text)`, `register_work_order_deficiency(jsonb)`, `request_work_order_return(uuid, uuid, text)`, `superadmin_update_profile(uuid, jsonb)` y `sync_work_order_material_usage(uuid, text, numeric, text)`.
- `dmp_archive_entity`: rechaza registros ya archivados con `El registro ya está archivado` despues del bloqueo `FOR UPDATE` y antes de `SOFT_DELETE`.
- `dmp_restore_entity`: rechaza registros no archivados con `El registro no está archivado` despues del bloqueo `FOR UPDATE` y antes de auditar `UPDATE`.
- Nuevos RPC `023`: `dmp_upsert_work_order_time_entry`, `dmp_delete_work_order_time_entry`, `dmp_upsert_work_order_material`, `dmp_delete_work_order_material`, `dmp_change_work_order_status`, `dmp_lifecycle_delete_plan` y `dmp_lifecycle_dependencies_enhanced`.
- `dmp_lifecycle_dependencies_enhanced` no reemplaza la funcion `022`; la envuelve para exponer dependencias bloqueantes y dependencias eliminables en cascada controlada sin tocar `022`.
- Comercial puede cambiar estado solo en partes de origen Comercial de su empresa donde sea creador o responsable actual. SAT, Gerencia y superadmin mantienen control completo validado por Supabase.
- El borrado controlado elimina filas relacionales y registros `files` exclusivos; no elimina objetos binarios de Storage desde SQL. La limpieza fisica de Storage queda fuera de esta migracion y debe ejecutarse con proceso administrativo si se requiere.

## Archivos modificados

- `supabase/migrations/022_security_lifecycle_controls.sql`
- `supabase/verification/preflight_security_lifecycle_022.sql`
- `supabase/verification/verify_security_lifecycle_022.sql`
- `src/auth/permissions.ts`
- `src/auth/permissions.test.ts`
- `src/services/entityLifecycleService.ts`
- `src/services/clientsService.ts`
- `src/services/sitesService.ts`
- `src/services/equipmentService.ts`
- `src/services/casesService.ts`
- `src/services/workOrdersService.ts`
- `src/services/checksService.ts`
- `src/App.tsx`
- `src/styles.css`
- `src/db/securityLifecycle.test.ts`
- `AUDITORIA_SEGURIDAD_Y_ELIMINACION.md`

## Migracion creada

- `supabase/migrations/022_security_lifecycle_controls.sql`
- `supabase/migrations/023_work_order_operations_and_controlled_delete.sql`: horas de parte, materiales gestionados por RPC, cambio directo de estado y borrado definitivo controlado con auditoria previa.

## Instrucciones para aplicar la migracion

1. Ejecutar el preflight en entorno de pruebas: `supabase/verification/preflight_security_lifecycle_022.sql`.
2. Revisar resultados de tablas, columnas, funciones y privilegios.
3. Aplicar manualmente `supabase/migrations/022_security_lifecycle_controls.sql` en Supabase siguiendo el proceso habitual del proyecto.
4. Ejecutar `supabase/verification/verify_security_lifecycle_022.sql`.
5. Probar manualmente con usuarios SAT, Gerencia, Superadmin y Tecnico en entorno no productivo.

## Preflight

- Archivo: `supabase/verification/preflight_security_lifecycle_022.sql`.
- Verifica tablas requeridas, columnas de soft delete/estado, privilegios actuales de RPC criticos y volumen inicial de registros archivable.
- Verifica recuento de superadmins operativos antes de aplicar protecciones sobre perfiles.
- Lista todas las sobrecargas encontradas para RPC criticos y anade resumen `critical_rpc_count`, `anon_execute_count`, `public_execute_count`, `authenticated_execute_count` antes de aplicar `022`.
- Archivo adicional: `supabase/verification/preflight_work_order_operations_023.sql`. Revisa tablas base, columnas actuales de materiales, estados validos, indices, FKs hacia entidades operativas, colisiones `local_change_id`, cruces de empresa en perfiles/materiales y permisos previos de RPC 023.

## Verificacion posterior

- Archivo: `supabase/verification/verify_security_lifecycle_022.sql`.
- Verifica existencia de RPC, ausencia de `EXECUTE` para `anon`, `EXECUTE` para `authenticated` solo en RPC publicos y politicas de lectura de archivados.
- Verifica firma y privilegios de `register_work_order_deficiency` y que declara `v_component`.
- Incluye bloque manual transaccional con `rollback` para validar restauracion de estados, archivado repetido y restauracion repetida en base de pruebas con fixtures reales.
- Muestra `FAIL` si cualquiera de las seis RPC criticas conserva `anon_execute=true` o `public_execute=true`; el resultado esperado posterior es `anon_execute_count=0` y `public_execute_count=0`.
- Archivo adicional: `supabase/verification/verify_work_order_operations_023.sql`. Verifica columnas de horas/materiales, permisos de RPC, RPC de dependencias mejorada, plan de borrado controlado e indices `local_change_id`; ofrece bloque `BEGIN/ROLLBACK` para probar estado directo, horas y materiales con fixtures reales.

## Pruebas ejecutadas

- `npx tsc -b --pretty false`: correcto.
- `npm test`: correcto, 32 archivos y 155 tests.
- `npm run build`: correcto con aviso Vite conocido por chunk mayor de 500 kB.

## Resultados exactos

- TypeScript: sin errores.
- Vitest: `32 passed (32)`, `155 passed (155)`.
- Build: correcto. El nombre exacto del asset JS puede variar por hash tras cada build.

## Limitaciones

- No se ejecutaron migraciones directamente en Supabase.
- No se realizaron pruebas destructivas contra produccion.
- Playwright no esta declarado en `package.json`; no se ejecutaron E2E automaticos.
- La verificacion real de RLS, permisos `EXECUTE`, restauracion de estados y carreras concurrentes requiere aplicar la migracion en una base de pruebas con usuarios reales por rol. Las pruebas locales son estaticas, de parseo SQL y de funciones puras/renderizado SSR limitado. No se afirma que los permisos reales de Supabase esten corregidos hasta ejecutar `verify_security_lifecycle_022.sql` contra Supabase.
- Queda recomendado endurecer en una fase posterior los `REVOKE` explicitos de RPC antiguos que no forman parte directa de ciclo de vida.

## Pruebas manuales pendientes

- SAT archiva y restaura cliente sin actividad.
- SAT intenta eliminar cliente con dependencias y ve relaciones bloqueantes.
- Gerencia archiva centro.
- Superadmin consulta archivados.
- Tecnico intenta acceder por URL directa a operaciones y Supabase deniega.
- Registro archivado desaparece de selectores operativos.
- Historial sigue mostrando registros archivados.
- Modal funciona a 360 px y Escape devuelve foco.
- No aparecen pantallas blancas ni errores no controlados en consola.
- En una base de pruebas, ejecutar el bloque `BEGIN/ROLLBACK` de verificacion para confirmar que un segundo archivado falla sin nueva auditoria `SOFT_DELETE`.
- En frontend, validar que el propietario global solo ve acciones de ciclo de vida cuando hay empresa seleccionada y el registro pertenece a esa empresa.
- En una base de pruebas, validar `023` con SAT, Gerencia, superadmin, Tecnico y Comercial para horas, materiales y cambio directo de estado.

## Tabla de aceptacion

| Prioridad | Entidad | Operacion | Rol autorizado | Comportamiento | Proteccion RLS/RPC | Auditoria | Prueba | Resultado |
|---|---|---|---|---|---|---|---|---|
| Alta | Clientes | Archivar | SAT/Gerencia/Superadmin | `deleted_at`, `status=Inactivo` | `dmp_archive_entity` valida empresa/rol | `audit_log`, `activity_log` | Vitest SQL | OK |
| Alta | Clientes | Borrar | SAT/Gerencia/Superadmin | Solo sin dependencias | `dmp_lifecycle_dependencies` recalcula | `audit_log`, `activity_log` | Vitest SQL | OK |
| Alta | Centros | Restaurar | SAT/Gerencia/Superadmin | Bloquea si cliente archivado | RPC transaccional | `audit_log`, `activity_log` | Vitest SQL | OK |
| Alta | Equipos | Archivar | SAT/Gerencia/Superadmin | Oculto de selectores activos | RPC + filtros activos | `audit_log`, `activity_log` | TypeScript/Vitest | OK |
| Alta | Partes | Archivar | SAT/Gerencia/Superadmin | Conserva actividad | RPC + historial de estado | `audit_log`, `activity_log` | Vitest SQL | OK |
| Alta | Checks | Borrar | SAT/Gerencia/Superadmin | Solo sin resultados/fotos/deficiencias | RPC valida dependencias | `audit_log`, `activity_log` | Vitest SQL | OK |
| Alta | Plantillas | Desactivar | SAT/Gerencia/Superadmin | `active=false` | RPC ciclo de vida | `audit_log`, `activity_log` | Vitest SQL | OK |
| Alta | Usuarios | Desactivar/restaurar | Propietario global/superadmin autorizado | Perfil DMP inactivo; Auth intacto | RPC bloquea SAT/Gerencia, self-disable y ultimo superadmin | `audit_log`, `activity_log` | Vitest SQL estatico | OK |
| Alta | Partes | Restaurar | SAT/Gerencia/Superadmin | Restaura estado previo desde auditoria | `dmp_previous_lifecycle_value` + historial | `audit_log`, `work_order_status_history` | Vitest SQL estatico | OK |
| Alta | Cualquier entidad lifecycle | Archivar repetido | SAT/Gerencia/Superadmin autorizado | Falla sin nueva auditoria `SOFT_DELETE` | Guarda bajo `FOR UPDATE` | Sin nuevo evento | Vitest SQL estatico + verificacion manual pendiente | OK |
| Alta | Cualquier entidad lifecycle | Restaurar no archivado | SAT/Gerencia/Superadmin autorizado | Falla sin auditoria `UPDATE` | Guarda bajo `FOR UPDATE` | Sin nuevo evento | Vitest SQL estatico + verificacion manual pendiente | OK |
| Alta | Alcance global frontend | Archivar/borrar | Propietario global | Solo empresa seleccionada real | `PlatformLifecycleScope` tipado | N/A | Vitest permisos | OK |
| Alta | Checks/equipos/expedientes | Restaurar | SAT/Gerencia/Superadmin | Restaura estado previo desde auditoria | Validacion de estados compatibles | `audit_log` | Vitest SQL estatico | OK |
| Alta | Deficiencias offline | Registrar | SAT/Gerencia/asignado | `v_component` declarado y trazable | RPC redefinida + revokes | Tabla `deficiencies` | Vitest SQL estatico | OK |
| Alta | anon | Cualquier operacion | Ninguno | Sin permisos | `REVOKE` explicito | N/A | Vitest SQL | OK |
| Alta | RPC criticas frontend | EXECUTE anon/public | Ninguno | `anon_execute_count=0`, `public_execute_count=0` esperado tras aplicar `022` | Revokes por firma exacta | N/A | Vitest SQL estatico + verificacion Supabase pendiente | Pendiente Supabase |
| Alta | Partes | Horas/materiales/estado directo | SAT/Gerencia/Superadmin/Tecnico segun alcance | Gestión por RPC, sin updates directos desde navegador | `023` + RLS + grants solo authenticated | `audit_log`, `work_order_status_history` | Vitest SQL estatico | Pendiente Supabase |
| Alta | Tecnico/Comercial/Oficina | Archivar/borrar | Ninguno | Botones ocultos y RPC deniega | `has_any_role` en RPC | N/A | Vitest permisos | OK |
