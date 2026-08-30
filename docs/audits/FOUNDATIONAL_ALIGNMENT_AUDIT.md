# Auditoria fundacional de producto

## Alcance y evidencia

Auditoria realizada antes de aplicar 094. No se ha ejecutado SQL remoto, no se ha ejecutado la migration 094, no se ha modificado codigo productivo ni documentacion fundacional.

Jerarquia aplicada: Constitution y Project DNA, Product Bible y Business Rules, ADR aceptadas, documentacion funcional, codigo y migraciones, tests y UI.

## Documentos leidos

Fundacionales:

- `docs/PROJECT_DNA.md`
- `docs/CONSTITUTION.md`
- `docs/PRODUCT_BIBLE.md`
- `docs/BUSINESS_RULES.md`
- `docs/KNOWLEDGE_ENGINE.md`
- `docs/SECURITY.md`

ADR aceptadas:

- `docs/ADR/ADR-001-offline-first.md`
- `docs/ADR/ADR-002-expediente-unico.md`
- `docs/ADR/ADR-003-security-by-design.md`
- `docs/ADR/ADR-004-knowledge-engine.md`
- `docs/ADR/ADR-005-referencia-fisica-equipo-libro-tecnico.md`

Documentacion funcional relevante:

- `docs/03-modelo-datos.md`
- `docs/04-arquitectura.md`
- `docs/10-offline-first.md`
- `docs/11-partes-trabajo.md`
- `docs/12-presupuestos.md`
- `docs/13-validacion-oficina.md`
- `docs/18-facturacion.md`
- `docs/02-requisitos-seguridad.md`
- `docs/ARCHITECTURE/WORKSPACE_ARCHITECTURE.md`
- `docs/OPERATIONS/SAT_DAILY_PLANNING.md`
- `docs/OPERATIONS/TECHNICIAN_QUALIFICATION_ENGINE.md`
- `docs/OPERATIONS/SUPPLIERS_PURCHASING_AND_STOCK.md`
- `docs/OPERATIONS/STOCK_RELIABILITY.md`
- `docs/OPERATIONS/MATERIAL_REQUESTS.md`
- `docs/OPERATIONS/TECHNICAL_HISTORY_AND_SEARCH.md`
- `docs/OPERATIONS/ALERTS_AND_EXPIRATIONS_CENTER.md`
- `docs/KNOWLEDGE_BASE/README.md`
- `docs/KNOWLEDGE_BASE/09_ITI_ENGINE.md`
- `docs/KNOWLEDGE_BASE/10_DIGITAL_TWIN.md`
- `docs/PRODUCT/MODULAR_PRODUCT_STRATEGY.md`
- `docs/IMPLEMENTATION/IMPLEMENTATION_AND_ADOPTION.md`
- `docs/IMPLEMENTATION/LEGACY_TRANSITION.md`
- `docs/PORTALS/CLIENT_PORTAL.md`
- `docs/REPORTING/EXPORTS_AND_TEMPLATES.md`

## Invariantes consolidados

Se consolidan 18 invariantes verificables:

| ID | Invariante | Fuente | Significado operativo |
| --- | --- | --- | --- |
| INV-001 | El tecnico trabaja; la aplicacion ayuda. | DNA 4; Constitution art. 7; RB-036 | El campo registra trabajo util y no administracion innecesaria. |
| INV-002 | Cada intervencion deja conocimiento. | DNA 2; Constitution art. 1/6; ADR-004 | Diagnostico, resultado, ITI, fotos, deficiencias y recomendaciones quedan trazados. |
| INV-003 | Todo proceso relevante queda en expediente o relacion trazable. | ADR-002; Product Bible 3/6 | Aviso, parte, presupuesto, garantia, factura, documentos y auditoria conservan contexto. |
| INV-004 | Nada relevante se elimina sin historial. | DNA 4; Constitution art. 3; RB-026 | Borrado logico o auditoria controlada; historico fiscal y tecnico no desaparece. |
| INV-005 | Un unico dato, multiples perspectivas. | DNA 4/6; Constitution art. 20; RB-042 | Workspaces consultan el nucleo comun sin duplicar ni mezclar responsabilidades. |
| INV-006 | La plataforma informa, ayuda y traza; la empresa decide. | DNA 4/5; Constitution art. 21; RB-007 | Las politicas empresariales no deben quedar fijadas irreversiblemente en UI o RPC. |
| INV-007 | Separacion tecnica, comercial, administrativa y logistica. | DNA 4; Constitution art. 24; RB-036/042/059 | Cada workspace modifica solo datos de su responsabilidad. |
| INV-008 | La causa inicial no se sobrescribe. | Product Bible 7; RB-021; ADR-002 | Diagnostico y actuacion real son datos independientes. |
| INV-009 | El cliente decide y su decision se documenta. | DNA 4; Constitution art. 5; RB-008/020 | Rechazos, autorizaciones y firmas quedan reconstruibles. |
| INV-010 | SAT valora tecnicamente y Comercial decide facturacion. | Product Bible 8; RB-028; Knowledge Engine 10 | Garantia tecnica y decision comercial son dominios distintos. |
| INV-011 | El tecnico no descuenta stock oficial. | Product Bible 8; RB-019 | SAT u Oficina validan antes de producir movimiento oficial. |
| INV-012 | Coste real y venta facturable son magnitudes distintas. | Constitution art. 24; RB-027; Product Bible 19 | Garantias conservan coste y rentabilidad aunque no exista ingreso. |
| INV-013 | Compras y movimientos requieren accion humana autorizada. | RB-034/050; Stock Reliability | DMP propone e informa; no decide compras ni ajustes automaticamente. |
| INV-014 | Facturacion requiere validacion y trazabilidad fiscal. | RB-010; docs/13; docs/18; Security 9 | Factura, lineas, estado, snapshot, anulacion y pagos mantienen historial. |
| INV-015 | Seguridad es minimo privilegio y Zero Trust. | Constitution art. 4/11/12; ADR-003; SECURITY | Permisos se verifican en backend, por accion, recurso y tenant. |
| INV-016 | Offline no pierde datos ni duplica reintentos. | Constitution art. 8; ADR-001; RB-004; RB-018 | UUID, conflictos, reintento y auditoria son parte del contrato operativo. |
| INV-017 | La garantia pertenece al equipo instalado. | Product Bible 4/8; ADR-005; RB-032 | No pertenece a referencia fisica ni se hereda automaticamente del equipo anterior. |
| INV-018 | El organigrama es configurable y evolutivo. | DNA 5/7; Constitution art. 9/21/22; Workspace Architecture | Roles actuales no deben impedir futuras politicas por empresa. |

## Business Rules

Se detectan `RB-001` a `RB-063`.

Reglas especialmente relevantes para esta auditoria:

| Regla | Modulo | Roles | Estado conocido | Criticidad |
| --- | --- | --- | --- | --- |
| RB-009 | Parte/flujo | Tecnico, SAT, Oficina | El tecnico ejecuta `Finalizado tecnicamente`; Oficina/SAT validan despues. | P1 |
| RB-018 | Materiales | Tecnico, SAT, Oficina | Material previsto y usado real estan separados. | P2 |
| RB-019 | Stock | Tecnico, SAT, Oficina | El RPC actual descuenta al registrar material, antes de validacion. | P0 |
| RB-021 | Parte | Tecnico, SAT | `description`, `diagnosis`, `work_performed` y `result` estan separados. | P2 |
| RB-027 | Economia | SAT, Comercial, Oficina, Gerencia | Coste de garantia y perdida economica se calculan en vistas/RPC. | P1 |
| RB-028 | Garantias | SAT y Comercial asignado | SAT informa causa; Comercial decide facturar/no/parte/gesto/garantia. | P0 |
| RB-036 | Workspaces | Tecnico y departamentos | La UI tecnica registra horas/materiales; hay riesgo de mezclar cobertura economica. | P1 |
| RB-041/042 | Workspaces | Todos | Nucleo comun y responsabilidades separadas. | P1 |
| RB-050 | Compras | Compras, SAT, Oficina | Las compras no se aprueban automaticamente. | P2 |
| RB-053/054 | Stock | Almacen/Compras | El modelo de stock distribuido y fiabilidad es conceptual/incompleto. | P1 |
| RB-061 | Busqueda | Todos | Busqueda transversal existe parcialmente. | P2 |
| RB-063 | Informes | Oficina, Gerencia | Seleccion de fotografias en PDF es futura. | P2 |

## DMP actual

### Cumple

- Mantiene coste interno separado de venta: `total_cost` y `total_price` en horas, materiales y costes.
- Mantiene costes de garantia en `v_work_order_economic_summary` y `warranty_cost`.
- Conserva movimientos de stock y consumo real, sin revertirlos por ser garantia.
- Usa borrado logico y auditoria para entidades operativas.
- Los borradores se pueden borrar con auditoria; facturas emitidas se anulan/revierten mediante funciones con historial.
- `fiscal_snapshot` queda preservado al emitir.
- El acceso de tecnico a partes esta limitado por asignacion en los RPC operativos.
- El flujo offline usa UUID, reintentos y auditoria local.
- El flag SAT de materiales/horas no facturables se mantiene como advertencia.

### Parcial

- El tecnico no cierra administrativamente en el sentido de facturacion: finaliza tecnicamente y el parte pasa a validacion. Sin embargo, la accion se presenta como finalizacion del parte y el RPC permite cerrar tecnicamente al tecnico; requiere una distincion UX/estado mas clara.
- SAT, Oficina y Comercial existen como workspaces y routing, pero las responsabilidades economicas se solapan.
- El modelo de garantia global existe, pero no separa formalmente valoracion tecnica de decision comercial.
- El Expediente Unico conceptual existe mediante relaciones `case_id`, `quote_id`, `work_order_id` e historiales, pero no todos los procesos tienen un contenedor uniforme.
- La validacion de oficina revisa informacion economica, pero el modelo no expresa suficientemente la autoridad final del Comercial asignado.
- La economia es canonica para coste/venta, pero no existe una vista separada de importe cubierto por garantia por concepto.

### Incumple

- `RB-019`: `dmp_upsert_work_order_material` ejecuta `dmp_apply_material_stock_movement(..., 'out', ...)` al registrar material en 035/058. La pantalla tecnica llama directamente a ese RPC. El tecnico puede provocar salida oficial antes de validacion SAT/Oficina.
- `RB-028`: el flujo implementado permite que SAT/Gerencia/Oficina decidan la cobertura mediante 094, mientras Product Bible y Business Rules asignan la decision final al Comercial asignado.

### No implementado o no determinado

- No se ha demostrado en el repositorio un motor de reglas empresariales configurable.
- No se ha demostrado una entidad completa de valoracion tecnica de garantia con causa, evidencia y resultado separado.
- No se ha ejecutado una prueba funcional real contra PostgreSQL o Supabase; por tanto los efectos de datos reales y tenant se consideran `NO DETERMINADO` hasta staging.

## Conflictos P0/P1

### P0-001 — Autoridad de garantia/facturacion

Fuente: Product Bible seccion 8, `RB-028`, Knowledge Engine seccion 10.

El Comercial asignado al cliente toma la decision final. La 094 preparada autoriza `SAT`, `Gerencia` y `Oficina`, y excluye Comercial. Es un conflicto funcional bloqueante, no una preferencia de implementacion.

Accion: decidir si `RB-028` sigue vigente o si se aprueba una evolucion documental. Si sigue vigente, 094 debe separar autoridad normal del Comercial y override configurable.

### P0-002 — Descuento de stock por tecnico

Fuente: Product Bible seccion 8 y `RB-019`.

El actual RPC de material usado realiza salida de stock inmediatamente. Esto contradice la regla fundacional de validacion previa.

Accion: no corregir en esta auditoria. Requiere decision de producto sobre si 094 queda bloqueada por este conflicto o si se abre un bloque separado de stock/validacion.

### P1-001 — Mezcla de valoracion tecnica y decision comercial

`work_order.warranty` y `economic_status` mezclan clasificacion tecnica, estado de flujo y resultado economico. 094 anade `billing_decision`, pero no una valoracion tecnica estructurada.

Accion: definir `technical_warranty_assessment` como dominio separado antes de consolidar garantias.

### P1-002 — Reglas de roles hardcodeadas

La 094 fija roles en SQL y frontend. Eso es seguro para minimo privilegio inmediato, pero no respeta completamente neutralidad organizativa ni prepara una politica por empresa. Debe existir una capa de permiso/capacidad que permita configurar autoridad y override sin cambiar formulas economicas.

## 094 vs BIBLIA

| Aspecto | Resultado | Dictamen |
| --- | --- | --- |
| Coste interno | Conserva horas, materiales, desplazamientos y costes aunque no facture. | OK |
| Facturacion parcial | Conceptualmente soporta conceptos adicionales y decisiones explicitas. | CAMBIO NECESARIO |
| Garantia pura | Coste real y sale cero; no crea borrador cero. | OK |
| Diagnostico SAT | 094 no crea valoracion tecnica de causa. | CAMBIO NECESARIO |
| Decision Comercial | 094 excluye Comercial y lo sustituye por SAT/Gerencia/Oficina. | CAMBIO NECESARIO, P0 |
| Gerencia | Puede ser override solo si politica empresarial lo autoriza. | DECISION NECESARIA |
| Oficina | Puede validar administrativamente; no debe asumir automaticamente autoridad comercial final. | DECISION NECESARIA |
| Tecnico | No debe decidir cobertura; esto se respeta en 094. | OK |
| Stock | 094 conserva el movimiento existente, pero el sistema actual ya contradice RB-019. | CAMBIO NECESARIO, P0 |
| Auditoria | Decision y facturacion quedan auditables; la autoridad debe ser correcta. | CAMBIO NECESARIO |
| Compatibilidad historica | `NULL` fail-safe y sin backfill son correctos. | OK |
| Configurabilidad futura | Roles y funciones hardcodeados dificultan B.R.E. futuro. | CAMBIO NECESARIO |

## Modelo conceptual recomendado antes de aprobar 094

Separar dos decisiones:

1. `technical_warranty_assessment`: valoracion SAT, causa probable, evidencia, reincidencia, equipo/garantia aplicable y recomendacion.
2. `billing_decision`: decision comercial final por concepto: facturable, no facturable, parcial, gesto comercial o garantia.

El Comercial asignado debe ser autoridad normal de `billing_decision` conforme a `RB-028`. Gerencia/Superadmin solo deben ser override si una politica empresarial vigente lo permite. SAT aporta la valoracion tecnica. Oficina valida datos, prepara y controla facturacion, pero no debe adquirir autoridad comercial por defecto.

El futuro Business Rules Engine debe resolver empresa, workspace, permiso, recurso, cliente, tipo de trabajo y excepcion. 094 puede usar permisos actuales como implementacion provisional, pero no debe consolidarlos como organigrama universal.

## DMP Product Guardrails

- `GR-001`: Nunca perder historico tecnico, fiscal, comercial, logistico o de auditoria.
- `GR-002`: Nunca otorgar permisos porque la UI necesite una accion.
- `GR-003`: Nunca convertir valoracion tecnica en decision comercial automaticamente.
- `GR-004`: Nunca falsear coste real para obtener la venta deseada.
- `GR-005`: Nunca obligar al tecnico a realizar administracion que corresponde a otro workspace.
- `GR-006`: Nunca descontar stock oficial antes de la validacion exigida por politica.
- `GR-007`: Nunca permitir que `billable` global convierta por si solo conceptos cubiertos en facturables.
- `GR-008`: Nunca crear factura o borrador de importe cero.
- `GR-009`: Nunca modificar una factura emitida, su snapshot, numero o pagos por una regla posterior.
- `GR-010`: Nunca introducir una segunda validacion departamental redundante sin finalidad funcional documentada.
- `GR-011`: Nunca hardcodear el organigrama donde debe existir una politica configurable.
- `GR-012`: Nunca sobrescribir la causa inicial con el diagnostico o la actuacion posterior.
- `GR-013`: Nunca borrar una deficiencia, consumo, decision o documento relevante sin proceso trazable.
- `GR-014`: Nunca confiar en la UI como frontera de seguridad; el backend debe verificar identidad, tenant, permiso y recurso.
- `GR-015`: Nunca perder datos offline ni duplicarlos al reintentar.
- `GR-016`: Nunca presentar una recomendacion automatica como decision de empresa o cliente.
- `GR-017`: Nunca mezclar origen logistico, coste interno, trabajo tecnico e importe facturable.
- `GR-018`: Nunca declarar una funcionalidad terminada solo porque compile; debe existir prueba funcional proporcional al riesgo.

## Definition of Done propuesta

Una funcionalidad se considera lista solo cuando:

- El requisito tiene fuente y prioridad identificadas.
- Los invariantes y guardrails afectados estan revisados.
- Roles, autoridad normal y override estan confirmados.
- Estados y transiciones estan definidos.
- El schema real, tenant, constraints y RLS estan auditados.
- El SQL se revisa semanticamente y se valida en PostgreSQL o se declara la limitacion.
- Existen tests de reglas, permisos, tenant, historico y regresion.
- El frontend no sustituye la autorizacion backend.
- La auditoria registra actor, momento, recurso, resultado y motivo cuando proceda.
- Existe prueba funcional real en entorno separado antes de produccion.
- Offline, conflictos y reintentos se prueban cuando aplique.
- Documentacion y ADR se actualizan si cambia una decision fundacional.
- Commit y push solo se realizan despues de validacion del propietario del producto.

## Documentacion desactualizada o en conflicto

- `RB-028`/Product Bible y `docs/13-validacion-oficina.md`/`docs/18-facturacion.md` no asignan exactamente la misma autoridad. La Biblia y Business Rules tienen precedencia; no debe resolverse silenciosamente en codigo.
- Los documentos vivos describen `RB-019` como validacion previa de stock, pero el comportamiento actual 035/058 descuenta al registrar material. El codigo incumple o la documentacion requiere una decision explicita; por jerarquia se clasifica como conflicto de implementacion.
- `docs/11-partes-trabajo.md` usa estados conceptuales distintos de los estados actuales `Finalizado tecnicamente`, `Pendiente de validacion` y `Enviado`. Requiere normalizacion documental, no una inferencia automatica de que uno de los dos este equivocado.
- La arquitectura y el Business Rules Engine estan marcados como conceptuales/futuros. No deben usarse para justificar que los hardcodes actuales ya sean configurables.

## Dictamen

La 094 queda **congelada y no aprobada para aplicacion** hasta resolver, como minimo:

1. Autoridad funcional de `RB-028`: Comercial asignado frente a SAT/Oficina/Gerencia.
2. Relacion entre valoracion tecnica SAT y decision comercial.
3. Conflicto actual de stock previo a cualquier ampliacion de garantias.
4. Politica de override y configurabilidad futura.

La separacion coste/venta y la compatibilidad historica de `NULL` son direcciones correctas, pero no compensan los conflictos P0.
