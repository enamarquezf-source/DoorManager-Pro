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

## Riesgos descartados

- No se encontro `service_role` en frontend.
- No se desactivo RLS.
- No se concedieron permisos globales a `authenticated` para tablas.
- Las asignaciones ya estaban endurecidas en `021` con soft delete y revokes explicitos.

## Diferencia entre archivar y borrar

- Archivar/desactivar conserva relaciones, historial y auditoria. Usa `deleted_at`, `active` o `status` segun la entidad real.
- Restaurar revierte el mecanismo real y valida padres activos cuando aplica.
- Eliminar definitivamente solo se permite si Supabase recalcula cero dependencias dentro de RPC y la confirmacion coincide con `ELIMINAR <codigo>`.
- Usuarios: no se borran cuentas Auth desde navegador; se desactiva el perfil DMP.

## Matriz de permisos

| Rol | Archivar | Restaurar | Borrar definitivamente | Alcance |
|---|---:|---:|---:|---|
| SAT | Si, excepto usuarios | Si, excepto usuarios | Si, solo sin dependencias y excepto usuarios | Su empresa |
| Gerencia | Si, excepto usuarios | Si, excepto usuarios | Si, solo sin dependencias y excepto usuarios | Su empresa |
| Superadmin empresa | Si | Si | Si, solo sin dependencias | Su empresa |
| Propietario global DMP | Si | Si | Si, solo sin dependencias | Alcance global validado por `is_platform_superadmin()` |
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
| Partes | `deleted_at`, `status=Cancelado` cuando aplica | Bloqueada si cliente, centro o equipo principal siguen archivados | Bloqueado con asignaciones, historial, notas, materiales, fotos, firmas, checks, deficiencias o documentos |
| Checks | `deleted_at`, `status=Cancelado` cuando aplica | Bloqueada si equipo o parte siguen archivados | Bloqueado con resultados, fotos o deficiencias |
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

## Verificacion posterior

- Archivo: `supabase/verification/verify_security_lifecycle_022.sql`.
- Verifica existencia de RPC, ausencia de `EXECUTE` para `anon`, `EXECUTE` para `authenticated` solo en RPC publicos y politicas de lectura de archivados.
- Verifica firma y privilegios de `register_work_order_deficiency` y que declara `v_component`.
- Incluye bloque manual transaccional con `rollback` para validar restauracion de estados en base de pruebas con fixtures reales.

## Pruebas ejecutadas

- `npx tsc -b --pretty false`: correcto.
- `npm test`: correcto, 31 archivos y 140 tests.
- `npm run build`: correcto con aviso Vite conocido por chunk mayor de 500 kB.

## Resultados exactos

- TypeScript: sin errores.
- Vitest: `31 passed (31)`, `140 passed (140)`.
- Build: correcto. El nombre exacto del asset JS puede variar por hash tras cada build.

## Limitaciones

- No se ejecutaron migraciones directamente en Supabase.
- No se realizaron pruebas destructivas contra produccion.
- Playwright no esta declarado en `package.json`; no se ejecutaron E2E automaticos.
- La verificacion real de RLS y de restauracion de estados requiere aplicar la migracion en una base de pruebas con usuarios reales por rol. Las pruebas locales son estaticas, de parseo SQL y de funciones puras/renderizado SSR limitado.
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
| Alta | Checks/equipos/expedientes | Restaurar | SAT/Gerencia/Superadmin | Restaura estado previo desde auditoria | Validacion de estados compatibles | `audit_log` | Vitest SQL estatico | OK |
| Alta | Deficiencias offline | Registrar | SAT/Gerencia/asignado | `v_component` declarado y trazable | RPC redefinida + revokes | Tabla `deficiencies` | Vitest SQL estatico | OK |
| Alta | anon | Cualquier operacion | Ninguno | Sin permisos | `REVOKE` explicito | N/A | Vitest SQL | OK |
| Alta | Tecnico/Comercial/Oficina | Archivar/borrar | Ninguno | Botones ocultos y RPC deniega | `has_any_role` en RPC | N/A | Vitest permisos | OK |
