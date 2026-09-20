# INFORME DE RECUPERACION DE LA ULTIMA AUDITORIA OPEN DMP 2026-09

## 1. IDENTIFICACION DE LA AUDITORIA

### Fuentes fuente

- `INFORME_TRASPASO_AUDITORIA_SOL_DMP_2026-09.md`: fuente principal de la auditoria global realmente ejecutada.
- `AUDITORIA_GLOBAL_ESTABILIZACION_DMP_2026-09.md`: checkpoint del mismo trabajo, con inventario de arquitectura y rutas.
- `INFORME_CIERRE_AUDITORIA_GLOBAL_DMP_2026-09.md`: consolidacion posterior de cambios y estado de los findings.
- `INFORME_AUDITORIA_RENDIMIENTO_2026-09-07.md`: auditoria anterior y separada; se usa solo como contexto, no como auditoria global principal.
- `INFORME_CONTINUIDAD_GPT_DOORMANAGER_PRO.md`: continuidad historica anterior, no equivalente a la auditoria global de septiembre.

### Identificacion

- Fecha aproximada: 2026-09-09.
- HEAD auditado: `5a63f478280d339b28dbf636b45c27d05f41d096`.
- Rama: `main`.
- Baseline registrado: `HEAD == origin/main`, divergencia `0 0`.
- Alcance real: inventario de arquitectura, `App.tsx`, rutas, navegacion, contratos URL, React/estado fuera de `App.tsx` y revision parcial de React dentro de `App.tsx`.
- No incluidos como auditoria completa: RPC, RLS, SQL semantico, Storage, offline/sync, stock, CSS/responsive, backend economico y E2E autenticado.

### Fiabilidad de la recuperacion

La recuperacion es fiable para los 20 findings documentados en el traspaso: cada uno tiene ID, severidad, evidencia, archivos, recomendacion y cobertura prevista. El checkpoint global declara expresamente que la auditoria fue interrumpida y no debe considerarse una auditoria completa del sistema. El estado posterior se toma del informe de cierre y de comprobaciones dirigidas sobre los simbolos actuales; no se ha repetido la auditoria global.

## 2. RESUMEN EJECUTIVO ORIGINAL

La auditoria original no publico conteos con las etiquetas `blocker`, `high`, `medium`, `low` o `cosmetic`, ni un total agregado de root causes. Publico severidades P2, P3 y P4. La siguiente conversion es solo de conteo de los IDs documentados: P2 = high, P3 = medium y P4 = low; no se afirma que el informe original usara esas etiquetas.

- Blockers/P1: `NOT RECORDED`.
- High/P2: 10 findings.
- Medium/P3: 8 findings.
- Low/P4: 2 findings.
- Cosmetic: `NOT RECORDED`.
- Total de root causes: `NOT RECORDED`.
- Total de findings documentados: 20.
- Conclusion original: navegacion `NEEDS_WORK`, mantenibilidad `NEEDS_WORK`, frontend `ACCEPTABLE`, backend/seguridad/offline sin valoracion fiable y tests buenos para contratos estaticos pero insuficientes para runtime.

## 3. MATRIZ COMPLETA DE HALLAZGOS ORIGINALES

`NOT RECORDED` se usa cuando el documento fuente no aporta el dato solicitado.

| ID | Severity | Area | Problem | Root cause | Evidence | Files | SQL required | Tests / coverage | Recommended action | Original status |
|---|---|---|---|---|---|---|---|---|---|---|
| SOL-ARCH-001 | P2 | Router / App.tsx | `App.tsx` concentra routing, auth, layout, navegacion y la mayoria de pantallas. | Concentracion de responsabilidades en un unico archivo. | 3.256 lineas, 514 KB, 238 funciones, unas 47 paginas y 38 rutas. | `src/App.tsx` | No | Suite, build y navegacion por dominio extraido. | Extraccion incremental, no refactor masivo. | CONFIRMED |
| SOL-ARCH-002 | P3 | Supabase queries / estado remoto | Coexisten unas 106 cargas `useLoad` con adopcion parcial de React Query. | Dos modelos de cache, loading, error, retry e invalidacion. | `useLoad` y hooks TanStack Query conviven en la aplicacion. | `src/App.tsx`, `src/query/` | No | Cache, recarga e invalidacion por pantalla. | Migrar por recorridos funcionales con contrato de invalidacion. | TECH_DEBT |
| SOL-ARCH-003 | P3 | Tests / E2E | La cobertura contractual valida mucho texto fuente/SQL y poco comportamiento runtime. | Dependencia de contratos estaticos y delimitadores textuales. | 120 tests bajo `src/db`; varios tests leen `App.tsx`; 76 usan `pg-query-emscripten`. | `src/db/*.test.ts`, tests de `App.tsx` | No para frontend; entorno aislado para integracion | RTL/router e integracion PostgreSQL/Supabase futura. | Conservar contratos y anadir pruebas conductuales. | TECH_DEBT |
| SOL-ROUTE-001 | P2 | Navegacion / Superadmin | El guard de Superadmin bloqueaba destinos genericos generados por componentes compartidos. | Rutas por workspace no centralizadas y componentes genericos montados en rutas Superadmin. | Links a clientes, equipos, partes, checks, documentos y perfiles fuera de prefijos admitidos. | `src/App.tsx`, `src/services/searchService.ts`, `src/services/materialsMovements.ts`, `src/modules/BillingModule.tsx` | No | Matriz runtime Superadmin. | Generador de rutas por workspace o componentes especializados. | CONFIRMED |
| SOL-ROUTE-002 | P2 | Navegacion / Tecnico | Desde un bloque de check el retorno al parte y el enlace de equipo usaban rutas no permitidas al tecnico puro. | Destinos genericos no dependientes del workspace. | `CheckBlockPageV2` y `canAccessRoute` mostraban el bloqueo determinista. | `src/App.tsx`, `src/auth/permissions.ts` | No | Parte -> check -> bloque -> parte, casos invalidos. | Retorno a `/app/tecnico/trabajo/:id` y copy claro para equipo. | CONFIRMED |
| SOL-ROUTE-003 | P2 | Casos / expedientes | `Related` usaba el ID de la asociacion como ID del registro destino. | No existia mapping por tipo de relacion. | `case_links` usa `related_id`; `case_documents` usa `document_id`, pero se concatenaba `row.id`. | `src/App.tsx`, `src/services/casesService.ts` | No | Fixtures de cada tipo y workspace. | Mapear tipo e ID destino explicitamente. | CONFIRMED |
| SOL-ROUTE-004 | P2 | Dashboards / URL filters | KPIs y acciones Comercial apuntaban a Gerencia y no consumian sus parametros. | Productores y consumidores de URL no compartian contrato semantico. | `/app/gerencia?vista=...`; acciones de oportunidad/visita no abrian la funcion anunciada. | `src/App.tsx` | No | Click de cada KPI y accion. | Usar modulos Comerciales canonicos; separar acciones Crear. | CONFIRMED |
| SOL-ROUTE-005 | P2 | Dashboards / Compras / Facturacion | Acciones rapidas Oficina llevaban a documentos/partes con parametros ignorados. | Rutas genericas en lugar de modulos canonicos. | `area=compras`, `area=proveedores` y `area=facturacion` no eran consumidos. | `src/App.tsx` | No | Tres acciones rapidas de Oficina. | Usar compras, proveedores y facturacion canonicos. | CONFIRMED |
| SOL-ROUTE-006 | P2 | Dashboards / Checks | `estado=realizado` abria la pestana de pendientes. | `ChecksPage` inicializaba `tab='pending'` sin leer URL. | Link KPI y estado inicial de `ChecksPage`. | `src/App.tsx` | No | Entrada directa y navegacion con ambos estados. | Sincronizar tab con `estado`. | CONFIRMED |
| SOL-ROUTE-007 | P3 | URL filters / deep links | Varios parametros emitidos por dashboards eran ignorados total o parcialmente. | No habia contrato productor-consumidor completo. | Filtros de partes, clientes, avisos, documentos y deficiencias no soportados por sus destinos. | `src/App.tsx`, `src/shared/filters.ts` | No | Parsing y render parametrizado por URL. | Implementar o retirar cada parametro con semantica confirmada. | CONFIRMED |
| SOL-ROUTE-008 | P3 | Router / ciclo de vida | `dependencyRoute` llevaba oportunidades/presupuestos a Comerciales e historial siempre a auditoria Superadmin. | Mapping de entidades y destino de historial no dependiente de rol. | Mappings en `App.tsx` y panel de dependencias. | `src/App.tsx` | No | Mapping por entidad y rol. | Corregir rutas canonicas y hacer historial dependiente de capacidad. | CONFIRMED |
| SOL-ROUTE-009 | P3 | Router / App.tsx | `/app/*` implementa un segundo router manual con regex y 28 patrones. | Evolucion incremental de aliases y rutas fuera del arbol declarativo. | Dispatcher `NotFound` con ramas duplicadas o eclipsadas. | `src/App.tsx` | No | Tabla completa de match, redirect y deep links. | Migracion declarativa gradual conservando aliases necesarios. | TECH_DEBT |
| SOL-ROUTE-010 | P4 | Navegacion / Superadmin | Marca y 404 llevan a `/app/inicio` y provocan redirect extra para Superadmin. | Home no resuelto por workspace. | `App.tsx:261,267,2663`. | `src/App.tsx` | No | Marca y 404 por workspace. | Resolver home por workspace. | TECH_DEBT |
| SOL-ROUTE-011 | P4 | Catalogo de modulos / deep links | Un `moduleId` desconocido cae en `OperationalModule` generico en vez de 404. | No habia allowlist explicita de modulos. | Fallback de `ModulePage` para cualquier ID. | `src/App.tsx` | No | Todos los IDs conocidos y uno aleatorio. | Construir allowlist antes de cambiar comportamiento. | LIKELY |
| SOL-REACT-001 | P2 | Supabase queries / React Query | `technicianOnly` cambiaba el `queryFn` pero no la clave. | Variante de consulta ausente de la identidad de cache. | Claves de resumen/detalle solo distinguian empresa e ID. | `src/query/queryKeys.ts`, `src/query/hooks.ts` | No | Precarga de variantes dentro de `staleTime`. | Incluir variante y revisar invalidaciones. | CONFIRMED |
| SOL-REACT-002 | P2 | Estado economico | `EconomicReviewPanel` no reconciliaba decisiones cuando cambiaban filas o parte. | Estado inicializado una vez desde props. | Filas nuevas no entraban en `updateDecision` y payload podia quedar obsoleto. | `src/components/EconomicReviewPanel.tsx` | No | RTL con `rerender`, altas/bajas y cambio de parte. | Reconciliar por `kind + entry_id`. | CONFIRMED |
| SOL-REACT-003 | P2 | Facturacion cliente | Dos clicks podian lanzar dos `prepareInvoice`. | No habia guardia ni estado pendiente por parte. | Handler y botones sin bloqueo durante la promesa. | `src/modules/BillingModule.tsx` | No para guardia frontend | Promesa diferida y asercion de una llamada. | Bloquear por parte durante la mutacion. | CONFIRMED |
| SOL-REACT-004 | P3 | Facturacion cliente / estado economico | Confirmacion de venta cero podia quedar valida tras cambiar decisiones. | Confirmacion no estaba ligada a la combinacion actual. | `zeroSaleConfirmed` no se reiniciaba al editar decisiones. | `src/components/EconomicReviewPanel.tsx` | No | Secuencia cero -> confirmar -> cambiar -> reconfirmar. | Invalidar confirmacion al cambiar inputs relevantes. | CONFIRMED |
| SOL-REACT-005 | P3 | Facturacion cliente / concurrencia | Un solo `saving` no representaba decisiones de garantia concurrentes. | Estado global por un unico ID. | Iniciar B reemplazaba A y finalizar cualquiera limpiaba todo. | `src/components/WarrantyBillingDecisionPanel.tsx` | No | Dos promesas controladas resueltas en orden inverso. | Bloqueo por fila o global coherente. | CONFIRMED |
| SOL-REACT-006 | P3 | Facturacion cliente / concurrencia | Respuestas de `reload` podian llegar fuera de orden; Strict Mode podia duplicar efecto inicial en desarrollo. | Sin cancelacion, request ID ni ordenacion de respuestas. | `BillingModule.reload` y `StrictMode`; no se reprodujo. | `src/modules/BillingModule.tsx`, `src/main.tsx` | No | Dos reloads inversos y desmontaje pendiente. | Escribir prueba antes de modificar. | NEEDS_RUNTIME_PROOF |

## 4. HALLAZGOS POR AREA

- Navegacion / workspaces: `SOL-ROUTE-001`, `SOL-ROUTE-002`, `SOL-ROUTE-010`.
- Casos / expedientes: `SOL-ROUTE-003`.
- Tecnico: `SOL-ROUTE-002`.
- Materiales / almacen: no hubo finding funcional propio; solo impacto indirecto de `SOL-ROUTE-001` en enlaces Superadmin.
- Compras: `SOL-ROUTE-005`.
- Facturas de proveedor: `NOT RECORDED` en la auditoria global original.
- Pagos proveedor: `NOT RECORDED` en la auditoria global original.
- Facturacion cliente: `SOL-REACT-003`, `SOL-REACT-004`, `SOL-REACT-005`, `SOL-REACT-006`.
- Tesoreria: `NOT RECORDED` en la auditoria global original.
- Superadmin / usuarios: navegacion Superadmin en `SOL-ROUTE-001`; administracion de usuarios no formaba parte del finding original y fue trabajo posterior.
- RBAC / permisos: evidencia de guard frontend en `SOL-ROUTE-001/002`; RPC, RLS y grants `NOT REVIEWED`.
- Dashboards: `SOL-ROUTE-004`, `SOL-ROUTE-005`, `SOL-ROUTE-006`.
- URL filters / deep links: `SOL-ROUTE-007`, `SOL-ROUTE-011`.
- Supabase queries / shapes: `SOL-ARCH-002`, `SOL-REACT-001`, y shape de asociaciones en `SOL-ROUTE-003`.
- Router / `App.tsx`: `SOL-ARCH-001`, `SOL-ROUTE-009`, `SOL-ROUTE-010`, `SOL-ROUTE-011`.
- Responsive / UX: `NOT REVIEWED` en esta auditoria global.
- Tests / E2E: `SOL-ARCH-003`; gaps de test en todos los findings con cobertura runtime pendiente.
- Catalogo de modulos: `SOL-ROUTE-011`.
- Search / navegacion universal: afectado por `SOL-ROUTE-001`; no hubo finding independiente.
- Otros: estado economico y React en `SOL-REACT-002`, `SOL-REACT-004`, `SOL-REACT-005`, `SOL-REACT-006`.

## 5. ESTADO ACTUAL COMPARADO

El estado se refiere al HEAD actual `b89608232e6d26094f5d1f776d891a712c1f0d74` (`Mejora historial y navegación de tesorería`). Las modificaciones no committeadas del worktree no se usan para afirmar cierres del HEAD.

| Finding | Original | Current status | Current evidence |
|---|---|---|---|
| SOL-ARCH-001 | Concentracion monolitica | OPEN | El informe de cierre dice que `App.tsx` sigue concentrando el frontend; el commit actual no divide la arquitectura. |
| SOL-ARCH-002 | `useLoad` + React Query | OPEN | El cierre confirma que no hubo migracion masiva y persisten ambos modelos. |
| SOL-ARCH-003 | Tests estaticos dominantes | PARTIALLY FIXED | Se anadieron tests dirigidos, pero siguen contratos estaticos y no existe E2E/integracion remota equivalente. |
| SOL-ROUTE-001 | Destinos genericos bloqueados para Superadmin | CLOSED | El cierre registra destinos canonicos corregidos; queda E2E autenticado como validacion, no como evidencia de que el bug estatico persista. |
| SOL-ROUTE-002 | Retorno tecnico bloqueado | OBSOLETE | El cierre indica que la evidencia original ya no existe y que se usa workspace tecnico. |
| SOL-ROUTE-003 | IDs de asociacion en expedientes | OBSOLETE | El cierre indica mapping por `related_id`/tipo y que la evidencia original ya no existe. |
| SOL-ROUTE-004 | KPIs Comercial incorrectos | CLOSED | El cierre registra normalizacion de KPI y destinos de modulo; existen tests `dashboardRoutes`. |
| SOL-ROUTE-005 | Acciones Oficina genericas | OBSOLETE | El cierre indica que la evidencia original ya no existe y que se usan rutas canonicas. |
| SOL-ROUTE-006 | Checks realizados ignoraba estado | OBSOLETE | `ChecksPage` usa `checkTabFromParams(params)` y existen tests para realizado/pendiente. |
| SOL-ROUTE-007 | Filtros URL ignorados | PARTIALLY FIXED | Se soportaron contratos concretos; el cierre dice que parametros sin semantica clara no se ampliaron. |
| SOL-ROUTE-008 | `dependencyRoute` incorrecto | CLOSED | El cierre registra oportunidades/presupuestos en sus modulos canonicos. |
| SOL-ROUTE-009 | Router manual duplicado | OPEN | El cierre confirma que se conserva `/app/*`, aliases y el dispatcher por compatibilidad. |
| SOL-ROUTE-010 | Redirect extra de home Superadmin | CLOSED | El enlace de marca usa la home canonica del workspace actual y la guardia usa coincidencia de ruta completa o descendiente. |
| SOL-ROUTE-011 | Modulo desconocido no es 404 | UNCONFIRMED | Sigue requiriendo allowlist de producto; no existe evidencia suficiente para cerrarlo o mantenerlo como bug confirmado. |
| SOL-REACT-001 | Colision de cache `technicianOnly` | CLOSED | `queryKeys` actuales incluyen `technician`/`full` y hooks pasan la variante; hay cobertura dirigida. |
| SOL-REACT-002 | Decisiones economicas obsoletas | CLOSED | El cierre registra reconciliacion por identidad y tests dirigidos. |
| SOL-REACT-003 | Doble preparacion de factura | CLOSED | Existe `prepareInvoiceOnce`, `preparingRef` y test de doble llamada; la idempotencia backend remota sigue fuera de alcance. |
| SOL-REACT-004 | Confirmacion cero obsoleta | CLOSED | El cierre registra invalidacion al cambiar inputs. |
| SOL-REACT-005 | Concurrencia de garantia | CLOSED | El cierre registra estado por decision implementado; la cobertura remota por rol sigue pendiente. |
| SOL-REACT-006 | Carrera de reload Billing | UNCONFIRMED | El cierre dice que no se reprodujo ni se cambio; falta test de respuestas fuera de orden. |

## 6. CERRADOS DESDE LA AUDITORIA

- `SOL-ROUTE-001`, estaticamente: destinos canonicos Superadmin corregidos; E2E autenticado pendiente.
- `SOL-ROUTE-010`, enlace de marca y home canonica por workspace.
- `SOL-ROUTE-004`, KPIs y destinos del dashboard Comercial.
- `SOL-ROUTE-008`, rutas de dependencias economicas.
- `SOL-REACT-001`, claves separadas por `technicianOnly`.
- `SOL-REACT-002`, reconciliacion de decisiones economicas.
- `SOL-REACT-003`, guardia de preparacion de factura.
- `SOL-REACT-004`, invalidacion de confirmacion de venta cero.
- `SOL-REACT-005`, estado de decisiones de garantia.


## 7. ABIERTOS REALES

- `SOL-ARCH-001`: concentracion de `App.tsx`.
- `SOL-ARCH-002`: coexistencia de `useLoad` y React Query.
- `SOL-ROUTE-007`: contrato incompleto de filtros URL.
- `SOL-ROUTE-009`: segundo router manual.


## 8. PARCIALMENTE RESUELTOS

- `SOL-ARCH-003`: hay tests dirigidos adicionales, pero la suite sigue siendo mayoritariamente contractual/estatica y no hay integracion remota ni E2E.
- `SOL-ROUTE-007`: se implementaron filtros con contrato claro; permanecen sin implementar los parametros cuya semantica no estaba documentada.


## 9. OBSOLETOS

- `SOL-ROUTE-002`: la evidencia del retorno tecnico bloqueado ya no existe.
- `SOL-ROUTE-003`: el mapping de relaciones ya no usa la evidencia defectuosa original.
- `SOL-ROUTE-005`: las acciones de Oficina usan modulos canonicos.
- `SOL-ROUTE-006`: `estado` ya se consume en `ChecksPage`.


## 10. NO CONFIRMADOS

- `SOL-ROUTE-011`: falta catalogo definitivo de modulos y prueba de deep links desconocidos.
- `SOL-REACT-006`: falta reproducir respuestas `reload` fuera de orden con promesas diferidas y desmontaje.
- Validacion runtime de `SOL-ROUTE-001` y de los flujos economicos: no hay credenciales/E2E disponibles.
- Estado remoto de migraciones, RLS, grants e idempotencia backend: no puede confirmarse localmente.

## 11. PRIORIDAD ACTUAL RECOMENDADA

### Prioridad original

- P2: `SOL-ARCH-001`, `SOL-ROUTE-001` a `SOL-ROUTE-006`, `SOL-REACT-001` a `SOL-REACT-003`.
- P3: `SOL-ARCH-002`, `SOL-ARCH-003`, `SOL-ROUTE-007` a `SOL-ROUTE-009`, `SOL-REACT-004` a `SOL-REACT-006`.
- P4: `SOL-ROUTE-010`, `SOL-ROUTE-011`.


### Prioridad actual

- Alta: cerrar la validacion E2E autenticada por rol y verificar economic flows sin afirmar cierre remoto.
- Alta: mantener `SOL-ROUTE-007` bajo contrato explicito para evitar deep links silenciosamente amplios.
- Media: `SOL-ARCH-001` y `SOL-ROUTE-009`, por riesgo de regresion y coste de mantenimiento.
- Media: `SOL-ARCH-002`, migrando por dominio y no de forma masiva.
- Baja: decision de producto/allowlist de `SOL-ROUTE-011`.
- Sin cambio: `SOL-REACT-006` permanece en prueba/confirmacion, no en implementacion especulativa.


## 12. PENDIENTES IMPORTANTES

- Superadmin / usuarios: el trabajo posterior de administracion tenant esta en `AUTH-RBAC-002`, pero no era finding original; migration 138 esta preparada y no aplicada/verificada remotamente.
- Dashboards / URL filters: mantener contrato productor-consumidor; `SOL-ROUTE-007` sigue parcial.
- Authenticated economic E2E: no existe Playwright configurado ni credenciales locales; no afirmar cierre de ventas, compras, cobros, pagos o tesoreria remoto.
- Supabase query risks: los shapes y `.single()` revisados tienen evidencia estatica; PostgREST real requiere entorno Supabase.
- Router / `App.tsx`: siguen abiertos `SOL-ARCH-001` y `SOL-ROUTE-009`.
- Responsive/manual: queda pendiente comprobar 360/390/768/1366/1920 con navegador real.
- RBAC cross-role: UI parcial; RPC/RLS/grants y tenant isolation requieren verificacion remota.
- Module catalogs: confirmar allowlist antes de decidir el tratamiento de `SOL-ROUTE-011`.
- Tests / E2E: complementar contratos estaticos con router runtime, concurrencia Billing, filtros URL y pruebas autenticadas.
- Backend economico: confirmar idempotencia de preparacion de factura y carreras de recarga antes de declarar cierre completo.


- En esta remediacion se modifico codigo de producto y tests locales; se preservaron los cambios previos del worktree.
- No se modifico SQL ni se creo migration durante esta remediacion.
- No se ejecuto SQL remoto.
- No se hizo commit ni push.

## 13. POST-REMEDIATION STATUS

Estado verificado sobre el worktree no commiteado, no sobre un nuevo HEAD:

| Finding | Estado post-remediacion | Evidencia local |
|---|---|---|
| `SOL-ARCH-001` | OPEN | `src/App.tsx` sigue siendo monolitico. |
| `SOL-ARCH-002` | PARTIALLY FIXED | `src/query/useLoad.ts` adapta cargas legacy a TanStack Query; aun coexisten consumidores legacy y hooks especializados. |
| `SOL-ARCH-003` | PARTIALLY FIXED | Se anadieron regresiones de rutas, filtros, carga y concurrencia; no hay E2E autenticado ni integracion remota. |
| `SOL-ROUTE-007` | PARTIALLY FIXED | `src/shared/urlContracts.ts` centraliza filtros soportados; no se inventaron contratos para parametros sin semantica confirmada. |
| `SOL-ROUTE-009` | PARTIALLY FIXED | `src/routing/appRoutes.ts` centraliza parsing y homes, pero `NotFound` manual y aliases siguen existiendo. |
| `SOL-ROUTE-010` | CLOSED | El enlace de marca resuelve `homeRouteForWorkspace(auth.workspace)`; la guardia Superadmin conserva solo rutas propias o compartidas validas. |
| `SOL-ROUTE-011` | CLOSED localmente | `ModulePage` devuelve `ModuleNotFound` para IDs fuera de `moduleMeta`; cubierto por la suite existente. |
| `SOL-REACT-006` | PARTIALLY FIXED | `BillingModule` protege respuestas obsoletas y tiene regresion funcional; falta prueba runtime autenticada con desmontaje. |

### Validacion post-remediacion

- `npm.cmd test`: `213` archivos, `1323` tests pasados.
- Tests dirigidos de rutas y regresiones: `8` archivos, `44` tests pasados.
- Test dirigido de marca y homes: `2` archivos, `5` tests pasados.
- `npm.cmd run build`: correcto; Vite solo emitio el warning existente de chunk grande.
- `git diff --check`: correcto; solo avisos de normalizacion LF/CRLF de Git.
