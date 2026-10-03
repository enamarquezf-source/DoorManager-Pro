# AUD-017-FULL-APPLICATION-INTEGRITY

Fecha: 2026-10-03
Repositorio: `E:\Grado Superior\Proyectos\DoorManagerPro`
Base inspeccionada: `main` / `9a1bf1d985948d275be48bc5c3f92421248d9bd0`
Tipo: auditoría read-only; no se corrigió producto.

## 1. Constitución y alcance

Se revisó `docs/CONSTITUTION.md` antes de la inspección. No se identificó conflicto constitucional. Se aplicó como criterio la trazabilidad, aislamiento de empresa y autorización por `profile_roles`/`has_permission()`. `primary_area` se considera sólo legacy/display, salvo que se documente como finding su uso funcional.

El worktree ya estaba dirty antes de esta auditoría. No se exigió limpieza, manifest, hash criptográfico ni commit. Se excluyeron del candidate todos los cambios previos; el único archivo creado por esta tarea es este informe.

## 2. Resumen ejecutivo

La aplicación compila y la suite existente pasa completa, pero la integridad funcional no queda demostrada por esos resultados: la cobertura es mayoritariamente estática y no existe evidencia runtime autenticada de navegación, deep links o consola.

Se confirmaron riesgos principales en:

- autorización de módulos genéricos y administración;
- usos funcionales residuales de `primary_area`;
- acciones de facturación/cobros visibles con guardas de escritura incompletas;
- alertas que no tienen ruta para varias entidades;
- enlaces de Tesorería que pierden el recurso seleccionado;
- formularios de Tesorería sin estado de guardado/loading;
- duplicación de dispatch/catalog que permite drift.

## 3. Inventario y cobertura real

| Superficie | Cobertura |
|---|---:|
| IDs de navegación/sidebar/dashboard inspeccionados | 44 |
| patrones `<Route>` únicos inspeccionados | 38 |
| marcadores de interacción (`button`, `Link`, handlers, `navigate`, `href`) | 1.034 |
| links/hrefs | 130 |
| formularios/modales (`form`/`role=dialog`) | 64 |
| roles tenant comparados | 6: superadmin, Gerencia, Oficina, SAT, Comercial, Tecnico |
| tests inspeccionados | 219 archivos |
| tests ejecutados | 219 archivos / 1.379 tests |
| runtime flows autenticados | 0; RUNTIME_NOT_TESTED |

Se revisaron las superficies CRM, SAT, Comercial, Almacén, Compras/Proveedores, Facturación/Cobros/Tesorería, Administración, Dashboard, Sidebar, búsqueda, avisos, offline, checks y partes. Platform Superadmin no aparece como rol independiente en `src/shared/types.ts`; no fue posible auditarlo como superficie separada.

## 4. Findings

### AUD-017-F-001 — autorización genérica de módulos no canónica

- **SEVERITY:** HIGH; **LEVEL:** 3; **AREA:** RBAC/catalog; **STATIC_CONFIRMED**.
- **MODULE/SCREEN:** `/app/modulos/*`, especialmente `administracion`, `prl`, `vehiculos`, `contratos`, `visitas`, `informes-comerciales`.
- **ORIGIN/INTERACTION:** deep link o enlace de sidebar a un módulo.
- **EXPECTED:** visibilidad de catálogo y autorización funcional separadas; cada módulo debe contrastar permiso granular y catálogo.
- **ACTUAL:** `canAccessRoute()` deja pasar `/app/modulos` para cualquier rol no técnico con roles de negocio (líneas 234-236 de `src/auth/permissions.ts`), sin exigir permiso/módulo específico. `ModulePage` despacha muchos IDs a `OperationalModule`, que carga documentos relacionados.
- **EVIDENCE:** `src/auth/permissions.ts:210-237`; `src/App.tsx:2538,2560-2572`.
- **IMPACT:** un rol puede abrir módulos publicados sin autorización específica; el backend puede rechazar después o devolver datos según RLS. La UI no distingue VISIBLE/ACCESSIBLE/AUTHORIZED.
- **RECOMMENDED FIX:** tabla única route→module→permission→renderer y guard explícito por módulo; tests por rol y deep link.
- **TEST NEEDED:** CLICK→GUARD→CATALOG→RENDERER para cada rol.

### AUD-017-F-002 — `primary_area` sigue influyendo en decisiones funcionales

- **SEVERITY:** HIGH; **LEVEL:** 3; **AREA:** RBAC/auth; **STATIC_CONFIRMED**.
- **EXPECTED:** `profile_roles` + `has_permission()` como autoridad.
- **ACTUAL:** redirección post-login usa `profile.primary_area`; edición de datos de empresa usa `canRole(profile?.primary_area, ...)`; `commercialReview` también mezcla `primary_area` con roles.
- **EVIDENCE:** `src/App.tsx:255`; `src/App.tsx:2546`; `src/shared/commercialReview.ts:3`; 98 referencias totales a `primary_area` bajo `src`, varias de presentación pero al menos estas son funcionales.
- **IMPACT:** rol efectivo y destino/acción UI pueden divergir del backend; riesgo de pantalla incorrecta o autorización incoherente.
- **RECOMMENDED FIX:** conservar `primary_area` sólo para display/compatibilidad y derivar redirección, edición y revisión de roles/permisos efectivos.

### AUD-017-F-003 — acciones de facturación/cobros sin guardas UI de escritura

- **SEVERITY:** MEDIUM; **LEVEL:** 1/3; **AREA:** Billing/RBAC; **STATIC_CONFIRMED**.
- **SCREEN:** `/app/modulos/facturacion` y `/app/modulos/cobros`.
- **EXPECTED:** `billing.read` permite lectura; crear cobro, cancelar factura y anular cobro requieren permiso de escritura correspondiente.
- **ACTUAL:** la ruta sólo comprueba `billing.read`; `BillingModule` muestra `REGISTRAR COBRO`, `Cancelar factura` y `Anular cobro` sin recibir perfil ni comprobar `billing.write`.
- **EVIDENCE:** `src/auth/permissions.ts:214-216`; `src/modules/BillingModule.tsx:29-43`; la matriz distingue `billing.read`/`billing.write` en `src/auth/rbac.ts:36-37`.
- **IMPACT:** acción visible que un usuario con sólo lectura puede intentar aunque no debería poder ejecutarla. La revisión local de `supabase/migrations/132_treasury_core.sql:178-205` confirma que los RPC de cobro/pago sí exigen permisos de escritura y compañía; por tanto este finding es incoherencia UX/defense-in-depth, no una vulnerabilidad backend demostrada.
- **RECOMMENDED FIX:** separar permisos read/write/reverse, ocultar/deshabilitar acciones y conservar validación server-side.

### AUD-017-F-004 — `routeForAlert` tiene fallback silencioso para entidades no mapeadas

- **SEVERITY:** HIGH; **LEVEL:** 1; **AREA:** alerts/deep links; **STATIC_CONFIRMED**.
- **EXPECTED:** cada tipo de alerta llega a entidad, recurso y pantalla correctos.
- **ACTUAL:** el mapa sólo cubre `work_orders`, `deficiencies`, `equipment`, `checks`, `clients`, `sites`, `cases`; cualquier otra entidad vuelve a `/app/avisos` sin diagnóstico.
- **EVIDENCE:** `src/App.tsx:3588-3590`.
- **IMPACT:** “Ir al registro” puede abrir el centro de avisos en lugar de facturas, cobros, compras, proveedores o documentos, perdiendo contexto sin error visible.
- **RECOMMENDED FIX:** catálogo exhaustivo de entidades/rutas, `unknown entity` observable y tests por tipo y permiso.

### AUD-017-F-005 — Tesorería pierde contexto de cobro/factura en deep link

- **SEVERITY:** MEDIUM; **LEVEL:** 1; **AREA:** treasury/billing; **STATIC_CONFIRMED**.
- **EXPECTED:** “Ver cobro”/“Ver factura” abre el recurso seleccionado.
- **ACTUAL:** `TreasuryModule` genera `/app/modulos/cobros?invoice=...&payment=...`, pero `BillingModule` no consume esos query params ni selecciona el pago/factura; el resultado es la lista general. Además, el enlace “Ver cobro” puede serializar `undefined` si faltan relaciones.
- **EVIDENCE:** `src/modules/TreasuryModule.tsx:88,97`; `src/modules/BillingModule.tsx:29-43`.
- **IMPACT:** deep link con contexto perdido y acción que parece abrir un recurso pero no lo hace.
- **RECOMMENDED FIX:** contrato URL explícito, lectura de params, estado seleccionado y fallback con mensaje si falta ID.

### AUD-017-F-006 — formularios de Tesorería sin loading/anti doble submit

- **SEVERITY:** MEDIUM; **LEVEL:** 1/2; **AREA:** forms; **STATIC_CONFIRMED**.
- **EXPECTED:** submit idempotente desde UI, estado loading y botón bloqueado hasta resultado.
- **ACTUAL:** `AccountForm`, `MovementForm` y `TransferForm` ejecutan servicios directamente en `submit`, muestran error pero no mantienen estado `saving` ni deshabilitan el botón.
- **EVIDENCE:** `src/modules/TreasuryModule.tsx:100-102`.
- **IMPACT:** doble click puede producir solicitudes duplicadas o errores predecibles; no hay feedback de progreso.
- **RECOMMENDED FIX:** estado saving común, disable, idempotencia de servicio y tests de doble submit.

### AUD-017-F-007 — administración accesible desde catálogo genérico con permiso funcional basado en legacy

- **SEVERITY:** MEDIUM; **LEVEL:** 3; **AREA:** administration/RBAC; **STATIC_CONFIRMED**.
- **SCREEN:** `/app/modulos/administracion`.
- **ACTUAL:** `canAccessRoute` la trata como módulo genérico; `CompanySettingsModule` carga datos operativos para cualquier perfil que atraviese esa ruta y calcula edición con `canRole(profile.primary_area, 'gestionar usuarios')` o `canManageHourRates`.
- **EVIDENCE:** `src/auth/permissions.ts:223-236`; `src/App.tsx:2542-2548`.
- **IMPACT:** acceso y capacidad de edición no están expresados con un permiso canónico de administración; posible exposición o pantalla accesible para SAT/Comercial.
- **RECOMMENDED FIX:** definir `admin.company.read/update`, guard de ruta y renderer con permisos efectivos.

### AUD-017-F-008 — dispatch y catálogo de módulos duplicados

- **SEVERITY:** LOW; **LEVEL:** 1; **AREA:** module catalog; **STATIC_CONFIRMED**.
- **ACTUAL:** `ModulePage` contiene dispatch manual; `moduleMeta` mantiene otra lista. `facturas-proveedor` y `tesoreria` no están en `moduleMeta` y funcionan sólo por ramas especiales de `OperationalModule`; IDs publicados nuevos caen en `ModuleNotFound` o renderer genérico.
- **EVIDENCE:** `src/App.tsx:2538`, `2560-2566`, `2616-2638`.
- **IMPACT:** drift route/moduleMeta/catalog/sidebar y componentes existentes pero no catalogados.
- **RECOMMENDED FIX:** registro único tipado con route, moduleId, workspace, permission y renderer.

## 5. Integridad de routing, links y acciones

- Routing: se localizaron rutas explícitas, wildcard y parser manual. Los aliases Superadmin inspeccionados tienen renderer o redirect; no se declaró PASS runtime porque no se ejecutaron deep links autenticados.
- Botones: no se encontraron handlers vacíos con la búsqueda estática específica; sí se observan las carencias de permisos/loading descritas en F-003 y F-006.
- Links/deep links: los contratos de proveedor de facturas (`?id`, `?nuevo=1`, `supplier`, `order`) sí son consumidos por `SupplierInvoicesModule`; esto contradice la hipótesis de fallo general en `/app/modulos/facturas-proveedor`, pero no cubre el caso de Tesorería de F-005.
- Fallback/404: existen `NotFound`, parser manual y aliases; el fallback de alertas es silencioso y es un riesgo independiente.

## 6. Módulos y áreas

- **CRM:** clientes, centros, contactos indirectos, expedientes y equipos tienen rutas/componentes; no hubo runtime ni prueba de cada permiso.
- **SAT/partes:** `workOrdersService.changeStatus` usa `dmp_change_work_order_status` y finalización técnica usa `dmp_finalize_work_order_technical`; no se observó `UPDATE` genérico de estado de work order en el servicio inspeccionado. AUD-002/migration 145 no se modifica.
- **Checks/offline:** existen tests específicos de navegación, bloques y cola offline; sin runtime no se verificó consolidación real multi-dispositivo.
- **Comercial:** oportunidades/ventas/presupuestos usan módulos y rutas; persiste uso funcional residual de `primary_area` en revisión.
- **Almacén:** materiales y movimientos tienen rutas y vistas; compras desde material conserva `material` en query.
- **Compras/proveedores:** el flujo pedido→factura proveedor conserva `supplier`, `order` y `receipt`; la pantalla consume `id` y `nuevo`.
- **Facturación/cobros/tesorería:** peor superficie por F-003 y F-005.
- **Administración:** peor superficie RBAC por F-001/F-002/F-007.
- **Portal cliente / Platform Superadmin:** no se identificaron superficies diferenciadas implementadas en las rutas auditadas; no se puede declarar cobertura funcional de una superficie no representada.

## 7. Búsqueda, alertas y dashboard

La búsqueda global devuelve clientes, equipos y partes con rutas `/app/clientes/:id`, `/app/equipos/:id` y `/app/partes/:id`; no transporta explícitamente estado archivado ni permiso por resultado en `searchService.ts`, quedando la seguridad efectiva a servicios/RLS y guard posterior. Las alertas usan `routeForAlert`; F-004 documenta entidades sin destino. Dashboard/sidebar se inspeccionaron por links y IDs; no hubo click runtime.

## 8. Tests y validación

### Ejecutado realmente

- `npm test`: **PASS**, 219 archivos y 1.379 tests.
- `npm run build`: **PASS**, TypeScript + Vite; warning de chunk principal >500 kB.
- `npm test -- --runInBand`: **FAIL de herramienta**, opción no soportada por Vitest; se reintentó con el script correcto.

### Gaps

La suite contiene tests de routing, catálogo, navegación, RBAC, dashboard, partes, billing, treasury, administración, offline y búsqueda, pero parte de la cobertura es de strings/estructura. No se encontró una matriz completa de pruebas CLICK→GUARD→CATALOG→RENDERER por rol. Runtime autenticado, consola, permisos efectivos remotos y deep links reales quedan **RUNTIME_NOT_TESTED**.

## 9. Impacto DB/RBAC

No se ejecutó Supabase, no se ejecutó SQL, no se llamaron writers, no se aplicaron migraciones y no se tocaron migraciones 123–145. Sí se inspeccionó SQL local de forma read-only para separar riesgo UI de autorización backend.

| Finding | Evidencia backend local | Aislamiento company | Permiso backend | Estado |
|---|---|---|---|---|
| F-001 módulos genéricos | `010_security_rls_integrity_transactions.sql:391-398` limita documentos a compañía y roles; `132_treasury_core.sql:79-86` limita Tesorería | Evidenciado en políticas/RPC revisados | Parcial por rol en tablas; no existe correspondencia completa con el catálogo frontend | STATIC_LOCAL; REMOTE_NOT_TESTED |
| F-003 cobros/pagos | `132_treasury_core.sql:178-205` exige `billing.write` + `treasury.transactions.create` o `supplier_payments.create` | `assert_member_of_current_company` y filtros por `company_id` | Evidenciado para RPC de cobro/pago; la UI no refleja la guardia | STATIC_LOCAL; no es vulnerabilidad backend probada |
| F-007 administración | `010_security_rls_integrity_transactions.sql:391-398` limita documentos; `017_platform_superadmin_global_scope.sql` separa scope global | Evidenciado para políticas revisadas | Se observan roles legacy en algunas políticas; no se verificó equivalencia completa con permisos granulares | STATIC_LOCAL; REMOTE_NOT_TESTED |

La tabla no sustituye una prueba remota de RLS/ACL. La configuración/migrations locales no demuestra aplicación remota ni autenticación. F-001 y F-007 permanecen como defectos de contrato de navegación/RBAC frontend y requieren una revisión backend específica antes de elevar impacto de datos.

## 10. Quick wins

1. Añadir guardas `billing.write`/permisos específicos a cancelar, cobrar y anular.
2. Convertir `routeForAlert` en registro exhaustivo con test por entidad.
3. Consumir y validar `invoice/payment` en Cobros.
4. Añadir `saving` y disable a los tres formularios de Tesorería.
5. Sustituir decisiones funcionales basadas en `primary_area`.
6. Centralizar el catálogo de módulos.

## 11. Plan de remediación

- **PHASE A — navegación inutilizable:** F-004, F-005.
- **PHASE B — módulos publicados rotos/incoherentes:** F-001, F-007, F-008.
- **PHASE C — RBAC:** F-002, F-003, F-007.
- **PHASE D — CRUD/acciones:** F-003, F-006.
- **PHASE E — deep links/búsqueda/alertas:** F-004, F-005 y pruebas de `searchService`.
- **PHASE F — UX/inconsistencias:** F-006, F-008.
- **PHASE G — regresión:** matriz por rol para cada ruta publicada y pruebas runtime no destructivas.

## 12. Auditor independiente

Pendiente de revisión independiente del informe por Auditor. Este Builder no emite `AUDIT_PASS`.

## 13. Estado Git y conclusión provisional

- Producto modificado por esta tarea: **NO**.
- SQL/migrations modificados por esta tarea: **NO**.
- Informe creado: **SÍ**, debe quedar untracked.
- Staging: **NO**.
- Commit: **NO**.
- Push: **NO**.

Conclusión Builder: **AUD_017_CLOSED** para el alcance estático/local de F-002 y F-008; runtime autenticado y backend remoto siguen fuera de verificación.

## 14. Estado de remediación AUD-017

Actualizado por Builder sobre base `9a1bf1d985948d275be48bc5c3f92421248d9bd0`. No se modificó la evidencia original.

| Finding | REMEDIATION STATUS | FILES CHANGED | TESTS | AUDITOR RESULT |
|---|---|---|---|---|
| F-001 | FIXED (static) | `src/routing/moduleCatalog.ts`, `src/auth/permissions.ts`, `src/App.tsx` | `aud017Remediation.test.ts`, `navVisibility001.test.ts` | PASS static; runtime/RLS not tested |
| F-002 | FIXED (static) | `src/App.tsx`, `src/auth/permissions.ts`, `src/services/superadminService.ts` | permissions suite, `aud017Remediation.test.ts` | PASS static; `primary_area` display-only and canonical roles/grants remain authoritative |
| F-003 | FIXED (static) | `src/modules/BillingModule.tsx`, `src/App.tsx` | `aud017Remediation.test.ts`, billing/collections UX tests | PASS static |
| F-004 | FIXED (static) | `src/routing/alertRoutes.ts`, `src/App.tsx` | `aud017Remediation.test.ts`, `managementNavigation.test.ts`, `testDataPurge055.test.ts` | PASS static |
| F-005 | FIXED (static) | `src/modules/TreasuryModule.tsx`, `src/modules/BillingModule.tsx` | `aud017Remediation.test.ts`, treasury tests | PASS static |
| F-006 | FIXED (static) | `src/modules/TreasuryForms.tsx`, `src/modules/TreasuryModule.tsx` | `aud017Remediation.test.ts`, treasury tests | PASS static |
| F-007 | FIXED (static) | `src/auth/permissions.ts`, `src/App.tsx` | `aud017Remediation.test.ts`, RBAC/navigation tests | PASS static |
| F-008 | FIXED (static) | `src/routing/moduleCatalog.ts`, `src/App.tsx` | `aud017Remediation.test.ts`, navigation/module tests | PASS static; explicit renderer registry and observable unknown-module fallback |

### Validación de la remediación

- `npm run build`: PASS; warning existente de chunk principal mayor de 500 kB.
- `npm test`: PASS, 220 archivos / 1.387 tests.
- Runtime autenticado, consola, RLS/RPC remoto y deep links reales: `RUNTIME_NOT_TESTED` / `NOT_VERIFIED`.
- Auditor independiente final: `AUDIT_PASS`; F-002 PASS, F-008 PASS; F-001, F-003, F-004, F-005, F-006 y F-007 sin regresión estática.
