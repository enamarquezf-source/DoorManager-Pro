# Auditoría visual UI — DoorManager Pro

**Fecha:** 2026-10-03
**Alcance:** auditoría estática del frontend actual contra `docs/UI_DESIGN_SYSTEM.md`
**Restricción:** no se modifica `src/**`; no se ejecuta navegador ni se valida un runtime visual en esta tarea.

## 1. Método y evidencia

Se revisaron los patrones compartidos y las pantallas declaradas principalmente en `src/App.tsx` y `src/styles.css`, además de los módulos visuales en `src/modules/**` y `src/components/**`. La auditoría busca patrones repetidos, no juzga el contenido funcional ni propone cambios de producto.

Evidencia principal:

- `src/styles.css:20`: fondo con `radial-gradient`.
- `src/styles.css:32`, `276`, `392`, `420-427`, `490`: gradientes en shell, informes, detail hero, login y técnico.
- `src/styles.css:55`, `471`, `486`, `543`: `backdrop-filter` en topbar, resumen de parte, cabecera técnica y barra de confirmación.
- `src/styles.css:62`, `74`, `84`, `168`, `221`, `235`: sombras y radios elevados en overlays, cards, listas y tarjetas de operación.
- `src/styles.css:133-140`: jerarquía de botones compartida, con variantes locales posteriores.
- `src/styles.css:154-180`: métricas, cards y badges globales.
- `src/styles.css:212-219`, `3471-3474` de `src/App.tsx`: filtros, estados y tabs compartidos.
- `src/App.tsx:490-513`: dashboard con KPIs, acciones rápidas y varias listas encapsuladas en `Card`.
- `src/App.tsx:3471-3527`: `ListPage`, `StateBlock`, `Card`, `Badge`, `WorkTable`, `RecordCard`, `Hero` y `Related`.
- `src/App.tsx:689`, `711`, `715`, `778`, `2149`, `2881`, `2989`, `3198`: listados y módulos que alternan cards, listas, tablas y grids.
- `src/App.tsx:3449-3459`, `3550`: formularios y modales compartidos, junto con variantes locales en módulos.

## 2. Cobertura por área

| Área | Pantallas/patrones revisados | Estado de auditoría |
| --- | --- | --- |
| Dashboard | `RoleDashboard`, dashboards SAT, Comercial, Oficina, Gerencia y Superadmin | Revisado; concentración de KPIs/cards y listas operativas dentro de cards. |
| CRM | `ClientsPage`, `ClientDetailPage`, `SitesPage`, `EquipmentPage` | Revisado; `RecordCard` y `Card` son el patrón dominante. |
| Clientes | list/detail de clientes | Revisado; acciones y resumen económico comparten jerarquía desigual. |
| Centros | `SitesPage`, `SiteDetailPage` | Revisado; cards de detalle y acciones repetidas. |
| Equipos | `EquipmentPage`, `EquipmentDetailPage`, foto/check visual | Revisado; ficha útil pero con envolturas y estilos de detalle divergentes. |
| Partes | `CasesPage`, `WorkOrdersPage`, `WorkOrderDetailPage` | Revisado; partes SAT usan cards/listas además de tablas. |
| SAT | dashboards, filtros, `SatWorkOrderCard`, revisiones | Revisado; múltiples estados visuales y botones de acción por fila. |
| Comercial | dashboard, presupuestos, oportunidades y revisión comercial | Revisado; uso de tono de módulo y cards de resumen. |
| Materiales | `MaterialsPage`, listados UX, detalle y movimientos | Revisado; existen dos familias visuales de listado y detalle. |
| Almacén | movimientos, stock, recepción y conciliación | Revisado; tablas y cards con variantes de filtros y estados. |
| Compras | pedidos, recepción, líneas y side panels | Revisado; duplicidad de pantallas de pedidos y tarjetas de pedido. |
| Proveedores | listado, ficha y relación material-proveedor | Revisado; grid de cards en vez de tabla operativa para catálogo. |
| Facturación | facturas, cobros, borradores y modales | Revisado; cards anidadas, modal grande y estilos específicos de billing. |
| Cobros | `BillingModule`, `CustomerPaymentModal`, estados de cobro | Revisado; acciones y estados mezclan texto, badges y botones. |
| Tesorería | `TreasuryModule`, movimientos y formularios | Revisado; cards de movimiento y paginación dentro de panel. |
| Administración | usuarios, permisos, empresa, plantillas | Revisado; cards reutilizadas para formularios y matrices. |
| Usuarios | usuarios, roles y `UserAccessPanel` | Revisado; varias fichas y acciones con distintos headers. |
| Documentos | list/detail y vínculos | Revisado; patrón propio `doc-list` junto a `Card` y `ListPage`. |
| Portal Cliente | rutas/componentes específicos no identificados como superficie independiente en la inspección estática | No concluyente; requiere inventario funcional/routing dedicado. |
| Técnico móvil | `TechnicianDayPage`, workstation, checks móviles, bottom sheet | Revisado; targets adecuados en parte, pero con hero, sticky actions y radios más decorativos. |

## 3. Findings

### HIGH

#### UI-H001

- **SEVERITY:** HIGH
- **AREA:** Global / Dashboard / módulos
- **SCREEN/MODULE:** `RoleDashboard`, `ListPage`, fichas de CRM, SAT, Compras y Administración
- **CURRENT PATTERN:** `Card` es el contenedor por defecto para dashboards, estados, listas, formularios y secciones relacionadas; `Related` incluso anida `Card` dentro de `Card` (`src/App.tsx:3547`).
- **WHY IT LOOKS GENERIC/AI:** La jerarquía se expresa repetidamente como tarjetas flotantes en lugar de estructura de página, secciones y filas.
- **USER IMPACT:** Aumenta el escaneo visual y dificulta distinguir contenido principal de agrupaciones auxiliares.
- **DESIGN SYSTEM RULE VIOLATED:** Cards sólo para KPIs, resumen, grupos independientes y dashboard; no encapsular cada bloque.
- **RECOMMENDED CHANGE:** Sustituir contenedores de presentación por `section`, `DetailSection`, filas y paneles con borde discreto; mantener cards sólo con agrupación semántica.
- **SHARED COMPONENT OPPORTUNITY:** `DetailSection`, `SectionHeader`, `Panel`.
- **RISK:** Medio; puede afectar espaciado y responsive si se hace globalmente sin regresión visual.
- **PRIORITY:** P0

#### UI-H002

- **SEVERITY:** HIGH
- **AREA:** Global / navegación / login / detalle
- **SCREEN/MODULE:** shell principal, Superadmin, login, `Hero`, `technician-workstation-head`
- **CURRENT PATTERN:** Gradientes decorativos y fondos radiales en `body`, sidebar Superadmin, detail hero, login y vistas técnicas (`src/styles.css:20`, `32`, `276`, `392`, `420-427`, `490`).
- **WHY IT LOOKS GENERIC/AI:** Introduce tratamiento de marketing o dashboard temático en superficies operativas que deberían ser sobrias y planas.
- **USER IMPACT:** Reduce la neutralidad entre módulos y añade ruido a la lectura de datos.
- **DESIGN SYSTEM RULE VIOLATED:** Evitar gradientes decorativos; diferenciar módulos por contenido y navegación.
- **RECOMMENDED CHANGE:** Mantener fondos planos; reservar color sólido para navegación activa, estados y acciones.
- **SHARED COMPONENT OPPORTUNITY:** tokens `background`, `surface`, `primary`; `PageHeader` sin hero decorativo.
- **RISK:** Medio; cambio transversal de identidad visual.
- **PRIORITY:** P0

#### UI-H003

- **SEVERITY:** HIGH
- **AREA:** Global / navegación / modales / técnico
- **SCREEN/MODULE:** topbar, work summary, tech top, confirm bar, bottom sheet
- **CURRENT PATTERN:** `backdrop-filter` y superficies translúcidas en elementos sticky/floating (`src/styles.css:55`, `471`, `486`, `543`).
- **WHY IT LOOKS GENERIC/AI:** El efecto glassmorphism se usa como tratamiento recurrente, no como necesidad funcional.
- **USER IMPACT:** Puede reducir contraste contextual, especialmente durante scroll y en móvil.
- **DESIGN SYSTEM RULE VIOLATED:** Evitar glassmorphism; usar elevación sólo cuando exista necesidad real.
- **RECOMMENDED CHANGE:** Usar superficies opacas con borde; reservar sombra/elevación para modal, dropdown, popover y menú flotante.
- **SHARED COMPONENT OPPORTUNITY:** `OverlaySurface`, `Drawer`, `StickyActionBar`.
- **RISK:** Medio; requiere revisar stacking y legibilidad en móvil.
- **PRIORITY:** P0

#### UI-H004

- **SEVERITY:** HIGH
- **AREA:** CRM / Comercial / Compras / Proveedores / módulos de catálogo
- **SCREEN/MODULE:** clientes, centros, equipos, proveedores, tarifas, pedidos y técnicos
- **CURRENT PATTERN:** Listados operativos relevantes usan `RecordCard` o grids de `Card` (`src/App.tsx:689`, `711`, `715`, `2609`, `2615`, `2989`, `3198`) en lugar de una tabla o lista densa.
- **WHY IT LOOKS GENERIC/AI:** El patrón card-first se repite para datos tabulares, con mucho borde y espacio por registro.
- **USER IMPACT:** Reduce densidad, comparación entre filas y velocidad de trabajo de oficina.
- **DESIGN SYSTEM RULE VIOLATED:** Las tablas son pieza principal; preferir rows/panels frente a cards repetidas.
- **RECOMMENDED CHANGE:** Convertir catálogos comparables a `DataTable`; mantener row/detail sólo cuando la comparación tabular no aporte valor.
- **SHARED COMPONENT OPPORTUNITY:** `DataTable`, `DataTableToolbar`, `ActionMenu`.
- **RISK:** Alto en módulos con acciones o permisos diferentes por fila.
- **PRIORITY:** P0

### MEDIUM

#### UI-M001

- **SEVERITY:** MEDIUM
- **AREA:** Global
- **SCREEN/MODULE:** cards, métricas, formularios, filas y overlays
- **CURRENT PATTERN:** Radios de 12–20px ampliamente usados; cards de 20px, modales de 20px y métricas de 18px (`src/styles.css:84`, `154`, `168`).
- **WHY IT LOOKS GENERIC/AI:** La escala visual se percibe blanda y uniforme, incluso en superficies estructurales.
- **USER IMPACT:** Debilita la distinción entre control, panel, fila y overlay.
- **DESIGN SYSTEM RULE VIOLATED:** Radios moderados y escala pequeña; no aplicar 16–24px de forma generalizada.
- **RECOMMENDED CHANGE:** Normalizar a 0/4/6/8px según token y conservar radios mayores sólo en casos móviles o contextuales justificados.
- **SHARED COMPONENT OPPORTUNITY:** tokens de radio compartidos.
- **RISK:** Bajo/medio.
- **PRIORITY:** P1

#### UI-M002

- **SEVERITY:** MEDIUM
- **AREA:** Global / Dashboard / listados
- **SCREEN/MODULE:** `.card`, `.metric`, `.record-card`, `.sat-work-card`, `.journey-card`
- **CURRENT PATTERN:** Sombras en cards y listas (`src/styles.css:154`, `168`, `221`, `235`, `498`) además de sombras grandes en dropdown y modal.
- **WHY IT LOOKS GENERIC/AI:** La elevación se convierte en separador universal.
- **USER IMPACT:** Añade ruido visual y hace menos clara la prioridad estructural.
- **DESIGN SYSTEM RULE VIOLATED:** Sombras sólo para elevación real.
- **RECOMMENDED CHANGE:** Retirar sombras de superficies de flujo normal; usar borde, fondo y espaciado.
- **SHARED COMPONENT OPPORTUNITY:** token `elevation.overlay` sólo para overlay/floating.
- **RISK:** Bajo.
- **PRIORITY:** P1

#### UI-M003

- **SEVERITY:** MEDIUM
- **AREA:** Dashboard / alertas / listas de detalle
- **SCREEN/MODULE:** `DashboardList`, `CompactRows`, `DependencyRows`, avisos y materiales
- **CURRENT PATTERN:** Se renderizan badges en cada fila para encabezado, código, duración o clasificación (`src/App.tsx:513`, `3519`, `3521`, `1016`, `1064`).
- **WHY IT LOOKS GENERIC/AI:** El badge funciona como formato universal aunque el valor no sea un estado.
- **USER IMPACT:** Compite con nombres y datos prioritarios.
- **DESIGN SYSTEM RULE VIOLATED:** Badge sólo para estado, prioridad, severidad o clasificación útil.
- **RECOMMENDED CHANGE:** Pasar códigos, nombres y métricas a texto estructurado; reservar `StatusBadge` para estados reales.
- **SHARED COMPONENT OPPORTUNITY:** `StatusBadge`, `CodeLabel`, `RowMeta`.
- **RISK:** Bajo.
- **PRIORITY:** P1

#### UI-M004

- **SEVERITY:** MEDIUM
- **AREA:** Dashboard
- **SCREEN/MODULE:** `RoleDashboard` y dashboards por workspace
- **CURRENT PATTERN:** Hasta 12 KPIs, una card de acciones rápidas, paneles de routing y varias `DashboardList` (`src/App.tsx:432-446`, `460`, `471`, `485-513`).
- **WHY IT LOOKS GENERIC/AI:** La portada puede convertirse en un mosaico de métricas y cards antes que en una cola de trabajo priorizada.
- **USER IMPACT:** El usuario debe decidir qué KPI es accionable y qué es sólo contexto.
- **DESIGN SYSTEM RULE VIOLATED:** Dashboard orientado a pendientes, incidencias, vencimientos, KPIs útiles y acciones reales.
- **RECOMMENDED CHANGE:** Limitar KPIs por rol, elevar colas y vencimientos, y mover métricas secundarias a páginas de análisis.
- **SHARED COMPONENT OPPORTUNITY:** `KpiBlock`, `OperationalQueue`, `QuickActions`.
- **RISK:** Medio; requiere validación con cada rol.
- **PRIORITY:** P1

#### UI-M005

- **SEVERITY:** MEDIUM
- **AREA:** Tablas / Compras / Almacén / Facturación
- **SCREEN/MODULE:** `WorkTable`, tablas de facturas, movimientos y pedidos
- **CURRENT PATTERN:** Hay `table-card` compartido, pero cabeceras se derivan de claves técnicas (`column.split('.').at(-1)`) y existen variantes locales de tabla y mobile-card (`src/App.tsx:3522`, `src/styles.css:327`, `358`, `681`, `698`).
- **WHY IT LOOKS GENERIC/AI:** La tabla no tiene un contrato único de nombres, densidad, columna de acciones y adaptación móvil.
- **USER IMPACT:** Menor escaneo y mayor coste de aprendizaje entre módulos.
- **DESIGN SYSTEM RULE VIOLATED:** Headers claros, alineación consistente, columnas prioritarias y paginación clara.
- **RECOMMENDED CHANGE:** Crear configuración explícita de columnas y una única toolbar/tabla canónica; definir patrón móvil por tabla.
- **SHARED COMPONENT OPPORTUNITY:** `DataTable`, `DataTableToolbar`, `Pagination`.
- **RISK:** Medio/alto.
- **PRIORITY:** P1

#### UI-M006

- **SEVERITY:** MEDIUM
- **AREA:** Formularios
- **SCREEN/MODULE:** `ModalForm`, `EntityForm`, formularios de proveedor, equipo, parte y facturación
- **CURRENT PATTERN:** Labels están presentes, pero muchos formularios se montan en modal y acumulan `form-grid`, `Card` anidada y campos largos; proveedores y compras añaden `Card` dentro del modal (`src/App.tsx:3459`, `3186`, `3115`).
- **WHY IT LOOKS GENERIC/AI:** El patrón de formulario se fragmenta en cajas y deja de leerse como un flujo único.
- **USER IMPACT:** Mayor carga cognitiva y scroll innecesario para tareas administrativas.
- **DESIGN SYSTEM RULE VIOLATED:** Agrupación lógica, anchuras coherentes, un primary action y evitar aire excesivo/encapsulado automático.
- **RECOMMENDED CHANGE:** Normalizar `FormSection` sin card por defecto, ordenar campos por tarea y reservar modal para tareas breves.
- **SHARED COMPONENT OPPORTUNITY:** `FormSection`, `FormActions`, `InlineValidation`.
- **RISK:** Medio.
- **PRIORITY:** P1

#### UI-M007

- **SEVERITY:** MEDIUM
- **AREA:** Modales / Drawers
- **SCREEN/MODULE:** `mini-modal`, `ModalForm`, `SidePanel`, modales de facturación, purga y stock
- **CURRENT PATTERN:** Muchas variantes locales de `.mini-modal`; algunas usan `Card` interna, otras un `form` directo, y `SidePanel` tiene su propio tratamiento (`src/App.tsx:3449`, `3548`; `src/styles.css:83-86`, `405`).
- **WHY IT LOOKS GENERIC/AI:** El usuario encuentra diálogos visualmente parecidos pero con padding, título, footer y jerarquía diferentes.
- **USER IMPACT:** Inconsistencia en acciones de confirmar/cancelar y en el comportamiento responsive.
- **DESIGN SYSTEM RULE VIOLATED:** Modal/drawer canónicos, con título claro, contenido acotado y footer inequívoco.
- **RECOMMENDED CHANGE:** Consolidar en `Modal`, `ConfirmDialog` y `Drawer`; eliminar `Card` interna cuando no haya agrupación semántica.
- **SHARED COMPONENT OPPORTUNITY:** `Modal`, `ConfirmDialog`, `Drawer`.
- **RISK:** Medio/alto por foco, scroll y accesibilidad.
- **PRIORITY:** P1

#### UI-M008

- **SEVERITY:** MEDIUM
- **AREA:** Global / Módulos
- **SCREEN/MODULE:** shell Superadmin, CRM, SAT, Comercial, Materiales, Compras y dashboards
- **CURRENT PATTERN:** Colores de tono por módulo (`commercial`, `maintenance`) y overrides específicos de billing/sat (`src/styles.css:93-99`, `163`, `180`).
- **WHY IT LOOKS GENERIC/AI:** La semántica de color se mezcla con identidad de módulo y puede presentar el mismo color como categoría, estado o decoración.
- **USER IMPACT:** Dificulta interpretar si un color indica módulo, estado o severidad.
- **DESIGN SYSTEM RULE VIOLATED:** Color = significado; no colores distintos por módulo sólo para decorar.
- **RECOMMENDED CHANGE:** Reducir tonos de módulo a navegación/contexto; mantener success/warning/danger/info estables.
- **SHARED COMPONENT OPPORTUNITY:** tokens semánticos y `StatusBadge`.
- **RISK:** Medio.
- **PRIORITY:** P1

#### UI-M009

- **SEVERITY:** MEDIUM
- **AREA:** Global / arquitectura visual
- **SCREEN/MODULE:** `App.tsx`, `BillingModule.tsx`, `TreasuryModule.tsx`, `UserAccessPanel.tsx`
- **CURRENT PATTERN:** Componentes visuales canónicos (`Card`, `Badge`, `StateBlock`) conviven con implementaciones locales de `Card`, listas y modales en módulos (`src/components/UserAccessPanel.tsx:81`; módulos revisados).
- **WHY IT LOOKS GENERIC/AI:** La duplicación deriva en pequeñas diferencias de espaciado, headers y acciones.
- **USER IMPACT:** Cambia la gramática visual entre pantallas equivalentes.
- **DESIGN SYSTEM RULE VIOLATED:** Consistencia entre módulos y componentes reutilizables.
- **RECOMMENDED CHANGE:** Inventariar y sustituir variantes locales por componentes canónicos en una fase específica.
- **SHARED COMPONENT OPPORTUNITY:** `Card`, `SectionHeader`, `StatusBadge`, `Modal`.
- **RISK:** Alto por regresiones de estilos y props.
- **PRIORITY:** P1

#### UI-M010

- **SEVERITY:** MEDIUM
- **AREA:** Técnico móvil
- **SCREEN/MODULE:** workstation, jornada, check mobile y acciones finales
- **CURRENT PATTERN:** Se combinan hero gradiente, cards, sticky bottom action, bottom sheet, pills y sombras (`src/styles.css:486`, `490`, `498`, `543`, `553`, `579`).
- **WHY IT LOOKS GENERIC/AI:** El flujo móvil tiene una estética propia más cercana a una app demostrativa que al sistema operativo común.
- **USER IMPACT:** Puede esconder la tarea actual entre superficies y acciones persistentes.
- **DESIGN SYSTEM RULE VIOLATED:** Cabecera compacta, densidad adecuada, acciones clave accesibles y decoración limitada.
- **RECOMMENDED CHANGE:** Mantener una sola cabecera compacta, priorizar acciones de estado/sincronización y reducir superficies decorativas.
- **SHARED COMPONENT OPPORTUNITY:** `MobileHeader`, `StickyActionBar`, `BottomSheet`.
- **RISK:** Alto; el técnico trabaja en condiciones y viewport variables.
- **PRIORITY:** P1

### LOW

#### UI-L001

- **SEVERITY:** LOW
- **AREA:** Global
- **SCREEN/MODULE:** `src/App.tsx` y módulos
- **CURRENT PATTERN:** Se observan estilos inline para barras visuales (`src/App.tsx:678`, `2133`, y bloque de check alrededor de `1530`).
- **WHY IT LOOKS GENERIC/AI:** Los valores visuales quedan fuera de tokens y dificultan mantener una escala común.
- **USER IMPACT:** Riesgo de divergencia sutil en color, altura y responsive.
- **DESIGN SYSTEM RULE VIOLATED:** Consistencia y componentes reutilizables.
- **RECOMMENDED CHANGE:** Encapsular visualizaciones en componentes con tokens y clases controladas.
- **SHARED COMPONENT OPPORTUNITY:** `MetricBar`, `ProgressBar`.
- **RISK:** Bajo.
- **PRIORITY:** P2

#### UI-L002

- **SEVERITY:** LOW
- **AREA:** Global / microcopy
- **SCREEN/MODULE:** botones y headers de operaciones
- **CURRENT PATTERN:** Mezcla de mayúsculas completas (`PREPARAR FACTURA`, `FINALIZAR PARTE TÉCNICO`, `REVISIÓN COMERCIAL`) y sentence case en acciones equivalentes.
- **WHY IT LOOKS GENERIC/AI:** La jerarquía tipográfica depende a veces de capitalización en lugar de nivel de acción.
- **USER IMPACT:** Reduce consistencia y legibilidad en escaneo rápido.
- **DESIGN SYSTEM RULE VIOLATED:** Microcopy claro, directo y jerarquía sobria.
- **RECOMMENDED CHANGE:** Normalizar a sentence case; reservar mayúsculas para estados/códigos donde tenga sentido.
- **SHARED COMPONENT OPPORTUNITY:** `ActionButton`, guía de microcopy.
- **RISK:** Bajo.
- **PRIORITY:** P2

#### UI-L003

- **SEVERITY:** LOW
- **AREA:** Detail pages
- **SCREEN/MODULE:** fichas de cliente, centro, equipo, parte, material y proveedor
- **CURRENT PATTERN:** Coexisten `page-head`, `Hero`, `detail-hero`, cabeceras propias (`material-detail-top`, `work-summary`) y breadcrumb/back button.
- **WHY IT LOOKS GENERIC/AI:** El mismo concepto de cabecera cambia de forma entre módulos.
- **USER IMPACT:** Aumenta el tiempo de orientación y dificulta anticipar dónde están las acciones.
- **DESIGN SYSTEM RULE VIOLATED:** PageHeader y navegación consistente.
- **RECOMMENDED CHANGE:** Adoptar `PageHeader` y `DetailPage` con variantes semánticas mínimas.
- **SHARED COMPONENT OPPORTUNITY:** `PageHeader`, `DetailHeader`, `Breadcrumbs`.
- **RISK:** Bajo/medio.
- **PRIORITY:** P2

#### UI-L004

- **SEVERITY:** LOW
- **AREA:** Iconografía
- **SCREEN/MODULE:** login, dashboards, métricas, navegación y acciones
- **CURRENT PATTERN:** Iconos funcionales de Lucide conviven con tratamientos de marca/ilustración y barras con iconos, por ejemplo `industrial-mark`, `door-illustration` y KPI icons (`src/App.tsx:269`, `506-508`).
- **WHY IT LOOKS GENERIC/AI:** Algunas ilustraciones introducen una capa decorativa que no aporta operación.
- **USER IMPACT:** Bajo; principalmente afecta percepción de madurez y foco.
- **DESIGN SYSTEM RULE VIOLATED:** Iconos funcionales, sin círculos o decoración por defecto.
- **RECOMMENDED CHANGE:** Mantener iconos para orientación y acción; retirar o limitar ilustración a login si supera su función de marca.
- **SHARED COMPONENT OPPORTUNITY:** `IconButton`, `ActionIcon`, guía de iconos.
- **RISK:** Bajo.
- **PRIORITY:** P2

## 4. Patrones sistémicos

| Patrón | Severidad dominante | Evidencia | Dirección |
| --- | --- | --- | --- |
| `CARD_OVERUSE` | HIGH | `Card` usada por dashboards, estados, fichas y relaciones | Sections/panels/rows; cards semánticas. |
| `EXCESSIVE_RADIUS` | MEDIUM | radios 12–24px generalizados | escala 0/4/6/8px. |
| `EXCESSIVE_SHADOW` | MEDIUM | cards y filas con box-shadow | elevación sólo en overlays. |
| `BADGE_OVERUSE` | MEDIUM | badges para encabezados, códigos y duración | `StatusBadge` sólo semántico. |
| `INCONSISTENT_PAGE_HEADER` | LOW | `page-head`, `Hero`, `detail-hero`, cabeceras locales | `PageHeader`/`DetailHeader`. |
| `BUTTON_HIERARCHY` | MEDIUM | primarios mezclados con acciones de fila y mayúsculas | una acción dominante por contexto. |
| `TABLE_DENSITY` | MEDIUM | tablas correctas pero variantes y cards de catálogo | `DataTable` canónica. |
| `FORM_LAYOUT` | MEDIUM | modal + grids + cards anidadas | `FormSection` sin card automática. |
| `MODAL_STYLE` | MEDIUM | varias implementaciones de `mini-modal` | `Modal`/`ConfirmDialog`/`Drawer`. |
| `MOBILE_INCONSISTENCY` | MEDIUM | workstation, bottom sheet y cards con reglas propias | shell móvil común. |
| `DUPLICATE_COMPONENTS` | MEDIUM | `Card` local en componentes y variantes de módulos | un inventario de primitives. |
| `INLINE_STYLE_DEBT` | LOW | barras y alturas inline | wrappers con tokens. |
| `COLOR_INCONSISTENCY` | MEDIUM | tonos de módulo y overrides específicos | color semántico estable. |
| `TYPOGRAPHY_HIERARCHY` | LOW | mayúsculas, heroes y tamaños locales | escala tipográfica y sentence case. |

## 5. Peores áreas visuales

1. **Shell y login:** gradientes, radial background, glassmorphism y tratamiento de marca elevan la decoración global.
2. **Dashboards por rol:** demasiadas métricas y paneles antes de una cola priorizada de trabajo.
3. **Catálogos CRM/Compras/Proveedores:** cards repetidas donde la comparación tabular sería más rápida.
4. **Fichas y partes:** cabeceras y secciones con variantes, cards anidadas y acciones numerosas.
5. **Técnico móvil:** hero, sticky actions, bottom sheet y radios/sombras no comparten una gramática mínima con oficina.

## 6. Oportunidades de componentes compartidos

Backlog propuesto, sin implementación en esta tarea:

1. `PageHeader` / `DetailHeader` / `SectionHeader`.
2. `DataTable` + `DataTableToolbar` + `FilterBar` + `Pagination`.
3. `StatusBadge` + `PriorityIndicator` + `CodeLabel`.
4. `FormSection` + `FormActions` + `InlineValidation`.
5. `Modal` + `ConfirmDialog` + `Drawer` + `ActionMenu`.
6. `EmptyState` + `ErrorState` + `LoadingState`.
7. `KpiBlock` + `OperationalQueue` + `QuickActions`.
8. `DetailSection` + `InfoList` + `RelatedList`.
9. `MobileHeader` + `StickyActionBar` + `BottomSheet`.
10. `MetricBar` / `ProgressBar` con tokens, para eliminar estilos inline.

## 7. Quick wins futuros

Cambios de bajo riesgo y alto impacto visual, **no aplicados**:

- Retirar gradientes decorativos de `body`, sidebar y headers.
- Reducir radios globales a la escala canónica.
- Eliminar sombras de cards, métricas y filas normales.
- Reducir `backdrop-filter` a overlays estrictamente necesarios o eliminarlo.
- Normalizar `PageHeader` en listados y detail pages.
- Reducir nesting de cards en dashboards, fichas y formularios.
- Convertir badges de códigos/metadatos a texto secundario.
- Normalizar botones a sentence case y una única acción primaria por contexto.
- Consolidar estados vacíos/loading/error en patrones sin card automática.

## 8. Plan de saneamiento

### PHASE UI-A — Tokens y base CSS

Definir tokens de superficie, borde, color semántico, tipografía, espaciado, radios y elevación. Retirar gradientes/glassmorphism decorativos y establecer la escala base.

### PHASE UI-B — Page headers, layout y toolbars

Normalizar shell, sidebar, breadcrumbs, `PageHeader`, `DetailHeader`, toolbars y jerarquía de acciones.

### PHASE UI-C — Tables, filters y lists

Consolidar `DataTable`, densidad de filas, filtros, acciones de fila, estados, paginación y adaptación móvil.

### PHASE UI-D — Forms, modals y drawers

Aplicar `FormSection`, validación inline, `Modal`, `ConfirmDialog`, `Drawer` y footer de acciones.

### PHASE UI-E — Dashboard

Reducir KPIs decorativos, priorizar colas operativas y hacer explícitos periodo, contexto y siguiente acción.

### PHASE UI-F — Module-by-module cleanup

Remediar por este orden: CRM, SAT/Partes, Comercial, Materiales/Almacén, Compras/Proveedores, Facturación/Cobros, Tesorería, Administración y Documentos.

### PHASE UI-G — Mobile/technician

Normalizar cabecera, targets, acciones finales, drawers/bottom sheets, densidad y permisos visibles para técnico.

### PHASE UI-H — Visual regression / consistency tests

Añadir revisión de screenshots o pruebas visuales, inventario de componentes, checklist anti-AI y comprobaciones de tokens/variantes antes de aceptar cambios.

## 9. Limitaciones y siguiente acción

Esta auditoría es estática: no confirma tamaños reales en navegador, contraste renderizado, overflow en dispositivos concretos ni comportamiento con datos reales. El siguiente paso recomendado es convertir UI-A/UI-B en un candidate separado, con revisión visual por viewport y sin mezclar saneamiento funcional.

## 10. Estado de remediación UI-A/UI-B — candidate 2026-10-03

Se conserva toda la evidencia original anterior. Esta actualización documenta únicamente el candidate de tokens/base visual y headers/layout/toolbars; no declara cerradas UI-C a UI-H.

### UI-A STATUS

**COMPLETE — candidate lógico aprobado por auditoría independiente.**

Aplicado en el candidate:

- Tokens compartidos de espaciado, radio, superficie, fondo, borde, texto, texto atenuado, primary y estados semánticos (`success`, `warning`, `danger`, `info`), además de `shadow-overlay`.
- Radios base normalizados para superficies, controles y navegación a la escala 0/4/6/8px mediante tokens.
- Sombras retiradas de cards, métricas, listados y superficies normales; conservadas en dropdowns, popovers y modales.
- Fondos globales, shell, login, detalle y cabecera técnica pasados a superficies sólidas; se mantienen efectos funcionales o específicos fuera de esta reducción inicial.
- Tipografía base y jerarquía de títulos de página ajustadas sin títulos gigantes en el patrón compartido.

Findings mitigados: `UI-H002`, `UI-H003` (shell/login/superficies revisadas), `UI-M001`, `UI-M002`, y parte de `UI-M008`.

### UI-B STATUS

**COMPLETE — candidate lógico aprobado por auditoría independiente.**

Aplicado en el candidate:

- Componente compartido `PageHeader`, variante `DetailHeader` y `Toolbar` responsive.
- `ListPage` y las cabeceras de detalle que utilizaban `Hero` consumen los patrones compartidos.
- Acciones y contexto se agrupan en zonas explícitas; los filtros de listados se mantienen próximos al contenido.
- Layout móvil para headers y toolbars: apilado, acciones a ancho disponible y sin overflow horizontal añadido.

Findings mitigados: `UI-L003` en las superficies migradas y parte de `INCONSISTENT_PAGE_HEADER`, `BUTTON_HIERARCHY` y `MOBILE_INCONSISTENCY`.

### Findings visuales cerrados en este candidate

- Retirada del gradiente/radial global de `body` y de los gradientes decorativos del shell Superadmin, login, detail hero y cabeceras técnicas intervenidas.
- Retirada de glassmorphism de topbar, resumen de parte y barra de confirmación intervenidas.
- Tokens visuales y escala de radios/elevación establecidos como base única.
- Patrón compartido de header de listado/detalle y toolbar creado y aplicado en superficies representativas.

### Findings parcialmente mitigados

- `UI-H001`: se redujo el encapsulado estructural en el header/listado, pero no se ha hecho el saneamiento global de cards.
- `UI-H004`, `UI-M003`, `UI-M005`, `UI-M006`, `UI-M007`, `UI-M009`, `UI-M010`, `UI-L001`, `UI-L002` y `UI-L004`: permanecen fuera del alcance UI-A/UI-B o requieren UI-C/UI-D/UI-F/UI-G.
- `UI-M008`: se estabilizaron tokens semánticos; quedan overrides y tonos locales para fases posteriores.

### Findings todavía pendientes

UI-C, UI-D, UI-E, UI-F, UI-G y UI-H permanecen pendientes. También queda pendiente la adopción exhaustiva de `PageHeader` en todas las cabeceras locales y la validación visual real por navegador/viewport, que esta auditoría estática no puede demostrar.

### Dictamen independiente inicial

- UI-A: `UI-A FAIL` — tokens/radios incompletos, gradientes residuales y valores literales de sombra/color.
- UI-B: `UI-B FAIL` — adopción parcial de headers/toolbars, búsqueda sin etiqueta accesible explícita y breadcrumb no semántico.
- Overall: `AUDIT_FAIL`.

Correcciones posteriores al dictamen: se retiró el gradiente decorativo del informe imprimible, se centralizó la superficie de login, se eliminó la sombra de la acción técnica sticky, se añadió etiqueta accesible explícita a la búsqueda canónica y se convirtió el breadcrumb en `nav`. Requiere reauditoría independiente antes de declarar UI-A/UI-B completas.

## 11. Candidate lógico UI-A/UI-B

La revisión de cierre se realiza sobre un candidate lógico, no sobre la reproducibilidad global del worktree. El estado dirty/untracked preexistente y sus hunks no atribuibles a esta fase quedan fuera de alcance y no bloquean la auditoría.

### Alcance auditado

- `src/styles.css`: únicamente los hunks de tokens/base visual, superficies intervenidas, radios/sombras/gradientes corregidos y reglas responsive asociadas a UI-A/UI-B.
- `src/components/PageHeader.tsx`: `PageHeader`, `DetailHeader` y `Toolbar`.
- `src/App.tsx`: consumo de esos componentes, búsqueda global accesible, breadcrumbs y `ListPage`.

### FIXED_NOW_UI_A

- Fondos y superficies decorativas intervenidas convertidos a colores planos/tokens.
- Glassmorphism eliminado de las superficies intervenidas (`topbar`, resumen de parte, cabecera técnica y confirmación).
- Sombras decorativas eliminadas de cards, métricas, listados y acciones normales; elevación mantenida sólo en overlays mediante `--shadow-overlay`.
- Gradientes residuales de barras, progreso, placeholder, informe e ilustración intervenidos sustituidos por colores planos.
- Radios de los componentes intervenidos sustituidos por `--radius-sm`, `--radius-md` o `--radius-lg`.

### LEGACY_OUT_OF_SCOPE

Valores literales de radios, colores o estados en reglas no modificadas por UI-A/UI-B, variantes de UI-C/UI-D/UI-F/UI-G y estilos específicos de módulos no migrados. No se consideran findings del candidate lógico salvo que un hunk de esta fase los haya alterado.

### FIXED_NOW_UI_B

- `PageHeader`, `DetailHeader` y `Toolbar` reutilizados en las superficies representativas migradas.
- Búsqueda global y búsqueda de `ListPage` con nombre accesible explícito.
- Breadcrumb con `nav`, `ol`, `li` y `aria-current="page"`.

Las cabeceras locales de módulos no incluidos en las superficies representativas se mantienen como `LEGACY_OUT_OF_SCOPE`; su migración exhaustiva pertenece a UI-F.

### Dictamen de cierre del candidate lógico

- Candidate: `9a1bf1d985948d275be48bc5c3f92421248d9bd0` + cambios UI-A/UI-B atribuidos exclusivamente a los archivos de alcance.
- Dirty/untracked ajeno: reconocido y fuera de alcance; no bloquea esta auditoría.
- Auditor independiente: `UI-A PASS`, `UI-B PASS`, `AUDIT_PASS`.
- Findings FIXED_NOW pendientes: ninguno.
- UI-C–UI-H: permanecen fuera del alcance y pendientes.

## 12. Estado de remediación UI-C — candidate lógico 2026-10-03

La fase UI-C se revisa únicamente sobre los cambios atribuibles a tablas, listados, filtros, búsqueda, estados y adaptación responsive. El dirty/untracked ajeno permanece fuera de alcance y no bloquea la auditoría.

### UI-C STATUS

**COMPLETE — candidate lógico aprobado por auditoría independiente.**

### Findings cerrados

- `DataTable` compartida para tablas operativas con cabeceras, filas, acciones, estados de carga/vacío, caption accesible y soporte opcional de paginación.
- `FilterBar` compartida con búsqueda etiquetada, región accesible y reset de búsqueda, archivo y fechas URL canónicas.
- Labels humanos explícitos para columnas de `WorkTable`, sin fallback técnico `Dato`.
- Densidad de tabla ajustada a padding operativo medio y acciones agrupadas al final.
- Filtros de archivo con `aria-pressed`; scroll horizontal responsive controlado para tablas que requieren ancho mínimo.

### Findings parciales

- Las tablas de módulos no migradas a `DataTable` conservan sus implementaciones locales; no se hizo saneamiento modular profundo.
- La paginación se ofrece como integración opcional en `DataTable`; no se introduce paginación nueva donde el producto no la soporta.

### Findings deferred

- UI-D, UI-E, UI-F, UI-G y UI-H.
- Validación visual real mediante navegador y viewport físico, fuera de la infraestructura disponible en esta ejecución.

### Dictamen UI-C

- Candidate lógico: `src/components/DataTable.tsx`, `src/components/FilterBar.tsx`, integración UI-C en `src/App.tsx` y estilos UI-C en `src/styles.css`.
- Auditor independiente: `UI-C PASS`, `AUDIT_PASS`.

## 13. Estado de remediación UI-D — candidate lógico 2026-10-03

La fase UI-D se revisa únicamente sobre las primitivas y hunks de formularios, modales y drawers incluidos en este candidate. El dirty/untracked ajeno y los modales legacy no migrados permanecen fuera de alcance.

### UI-D STATUS

**COMPLETE — candidate lógico aprobado por auditoría independiente.**

### Findings cerrados

- `FormSection` compartida para agrupación estructural sin card decorativa por defecto.
- `ModalShell` compartida con header, cierre, IDs únicos, focus trap, restauración del opener y Escape controlado.
- Submit/cancel con jerarquía clara; cierre y Escape bloqueados durante `saving`.
- `ConfirmModal` evita dobles confirmaciones y muestra errores de operación.
- Errores de `ModalForm`, `EntityForm` y `ReasonConfirmModal` enlazados mediante `aria-describedby` y `role="alert"`.
- `SidePanel` con foco, restauración, `aria-labelledby`, `aria-describedby` contextual y scroll de overlay existente.
- Responsive de paneles y modales conservado mediante viewport limitado y scroll interno.

### Findings parciales

- Existen modales locales legacy que no consumen todavía `ModalShell`; no se migraron masivamente para evitar scope creep y regresiones funcionales.
- La validación visual real en navegador/viewport no está disponible en esta ejecución.

### Findings deferred

- UI-E, UI-F, UI-G y UI-H.

### Dictamen UI-D

- Candidate lógico: `src/components/FormPrimitives.tsx`, hunks UI-D de `src/App.tsx` y `src/styles.css`.
- Auditor independiente: `UI-D PASS`, `AUDIT_PASS`.

## 14. Estado de remediación UI-E — candidate lógico 2026-10-03

La fase UI-E se revisa únicamente sobre dashboards, KPIs, colas operativas y acciones rápidas incluidos en este candidate. El dirty/untracked ajeno permanece fuera de alcance y no bloquea la auditoría.

### UI-E STATUS

**COMPLETE — candidate lógico aprobado por auditoría independiente.**

### Findings cerrados

- `KpiBlock` compartido para valores, contexto, estado y navegación SPA.
- KPIs limitados por dashboard y jerarquizados visualmente como primarios/secundarios.
- Colas operativas y revisiones pendientes situadas antes del resumen numérico.
- Listados de dashboard convertidos a secciones operativas sin badges decorativos por registro.
- Acciones rápidas con una primera acción visualmente dominante y secundarias compactas.
- Iconos decorativos retirados de los bloques KPI; responsive en columnas 12/4/1 y listas apiladas.

### Findings parciales

- Algunos dashboards secundarios fuera de `RoleDashboard` mantienen patrones locales; su saneamiento exhaustivo pertenece a UI-F.
- La validación visual real en navegador/viewport no está disponible en esta ejecución.

### Findings deferred

- UI-F, UI-G y UI-H.

### Dictamen UI-E

- Candidate lógico: `src/components/KpiBlock.tsx`, hunks UI-E de `src/App.tsx` y `src/styles.css`, y `src/db/dashboardRoutes.test.ts`.
- Auditor independiente: `UI-E PASS`, `AUDIT_PASS`.

## 15. Estado de remediación UI-G — candidate lógico 2026-10-03

La fase UI-G se revisa únicamente sobre los hunks de experiencia móvil/técnica, presentación offline y sincronización incluidos en este candidate. El dirty/untracked ajeno permanece fuera de alcance y no bloquea la auditoría.

### UI-G STATUS

**COMPLETE — candidate lógico aprobado por auditoría independiente.**

### Findings cerrados

- Shell móvil: scroll de fondo bloqueado mientras la navegación está abierta, cierre por Escape y z-index diferenciado.
- Cabecera y acciones técnicas con targets táctiles mínimos de 44px y safe-area en superficies móviles.
- Mi jornada, workstation técnica, checks, materiales, fotos, firma e incidencias mantienen flujo de una columna y CTA accesible.
- Firma y controles de checks adaptados a viewport móvil sin alterar captura ni estados canónicos.
- Pendientes de sincronización conserva selección, reintento, fallidos, bloqueados, motivos y acciones bulk.
- `SyncButton` recupera el estado tras error y comunica el fallo sin dejar la interfaz bloqueada en “Sincronizando”.
- Formularios y overlays móviles conservan scroll interno y targets accesibles.

### Findings parciales

- No se ejecutó validación visual real en dispositivos ni navegador; responsive se verificó estáticamente.
- Existen superficies técnicas legacy adicionales fuera de los hunks UI-G que pueden beneficiarse de UI-H global.

### Findings deferred

- UI-H: regresión visual y consistencia global final.

### Dictamen UI-G

- Candidate lógico: hunks UI-G de `src/App.tsx`, reglas UI-G de `src/styles.css` y `src/db/pendingSyncUi.test.ts`.
- Auditor independiente: `UI-G PASS`, `AUDIT_PASS`.

## 16. Cierre de auditoría UI-H — candidate lógico 2026-10-03

UI-H se ejecutó como regresión visual estática del estado consolidado UI-A/UI-G. No se añadieron refactors globales ni se modificó lógica funcional. Los cambios dirty/untracked preexistentes y no atribuibles a esta revisión permanecen fuera de alcance.

### Estado

**PARTIAL — no se declara cierre visual global.**

La auditoría independiente confirmó que las correcciones base de superficies, sombras, gradientes, tablas, formularios, dashboards y móvil están presentes en las áreas intervenidas, pero siguen existiendo variantes legacy y deuda de consistencia transversal. Además, `VISUAL_RUNTIME_NOT_TESTED`: no se ejecutó navegador ni validación física por viewport.

### Los 18 findings originales

| ID | Estado final | Evidencia final | Fase relacionada |
|---|---|---|---|
| UI-H001 | PARTIAL | `Card` continúa dominante y existe `Card` anidada en `Related` (`src/App.tsx`). | UI-E/UI-F |
| UI-H002 | FIXED | No hay `gradient`/`radial-gradient` en `src/**`; superficies sólidas. | UI-A |
| UI-H003 | FIXED | No hay glassmorphism activo; `backdrop-filter` queda en `none` y sombras en overlays. | UI-A/UI-G |
| UI-H004 | PARTIAL | Persisten grids de cards en catálogos de proveedores, técnicos y tarifas. | UI-C/UI-F |
| UI-M001 | PARTIAL | Tokens existen, pero quedan radios literales de 12–24px en variantes legacy. | UI-A/UI-G |
| UI-M002 | FIXED | Cards/listas normales usan `box-shadow: none`; overlays conservan elevación. | UI-A |
| UI-M003 | PARTIAL | Quedan badges para códigos, duración y metadatos en listas técnicas/materiales. | UI-C/UI-E |
| UI-M004 | PARTIAL | `RoleDashboard` prioriza colas, pero dashboards secundarios conservan mosaicos locales. | UI-E |
| UI-M005 | PARTIAL | `DataTable` existe, pero sobreviven tablas locales y adaptaciones divergentes. | UI-C |
| UI-M006 | PARTIAL | `FormSection` existe, pero formularios legacy aún anidan cards en modales. | UI-D/UI-F |
| UI-M007 | PARTIAL | `ModalShell` cubre superficies migradas; siguen variantes `.mini-modal` legacy. | UI-D/UI-F |
| UI-M008 | PARTIAL | Tokens semánticos estabilizados; permanecen tonos y overrides locales. | UI-A/UI-F |
| UI-M009 | PARTIAL | Primitivas compartidas conviven con implementaciones locales en módulos. | UI-D/UI-F |
| UI-M010 | PARTIAL | Técnico mejora targets/flujo, pero conserva hero, cards, sticky action y bottom sheet propios. | UI-G |
| UI-L001 | PARTIAL | Persisten estilos inline para alturas dinámicas de barras (`src/App.tsx`). | UI-A/UI-E |
| UI-L002 | DEFERRED | Continúan acciones en mayúsculas como `FINALIZAR PARTE TÉCNICO`. | UI-F |
| UI-L003 | PARTIAL | `PageHeader`/`DetailHeader` conviven con `page-head`, `Hero` y cabeceras locales. | UI-B/UI-F |
| UI-L004 | PARTIAL | Ilustración de login sigue presente; iconografía funcional sí está normalizada en varias superficies. | UI-A/UI-B |

**Resumen:** FIXED `3`; PARTIAL `14`; DEFERRED `1`; NOT_REPRODUCIBLE `0`; TOTAL `18`.

### Anti-AI y componentes canónicos

- Gradientes: saneados en `src/**`.
- Glassmorphism: saneado en las superficies revisadas.
- Sombras: limitadas a overlays/floating surfaces.
- Cards, radios, badges, headers, toolbars y tablas: mitigados en componentes migrados; variantes legacy permanecen.
- Componentes canónicos presentes: `PageHeader`, `DetailHeader`, `Toolbar`, `DataTable`, `FilterBar`, `FormSection`, `ModalShell`, `SidePanel`, `ConfirmModal`, `ReasonConfirmModal`, `KpiBlock`.
- No se creó `ConfirmModal`/`ReasonConfirmModal` como archivo compartido independiente; son primitivas locales exportadas desde `App.tsx` y se consideran patrón vigente, no duplicación nueva.

### Deuda visual residual (DEBT, no BUG)

1. **Catálogos y fichas:** card-first y cabeceras legacy; impacto en densidad y comparación; migrar por módulo a `DataTable`/`DetailHeader` sólo con alcance aprobado.
2. **Formularios y overlays legacy:** variantes `.mini-modal` sin contrato uniforme; impacto en consistencia/foco; migrar de forma incremental y auditar cada flujo.
3. **Microcopy e inline styles:** mayúsculas y barras dinámicas inline; impacto bajo de coherencia; centralizar tokens/componentes en una futura tarea acotada.
4. **Validación visual:** sin screenshots ni navegador; impacto en la certeza del cierre; ejecutar revisión humana por desktop/tablet/mobile.
5. **Chunk >500 kB:** deuda técnica de build, fuera del alcance visual UI-H.

### Dictamen independiente final

- UI-A: PASS
- UI-B: PASS
- UI-C: PASS
- UI-D: PASS
- UI-E: PASS
- UI-F: FAIL en revisión global por saneamiento modular incompleto; el candidate limitado UI-F previo conserva su `AUDIT_PASS`.
- UI-G: PASS
- UI-H: FAIL
- DESIGN_SYSTEM_COMPLIANCE: PARTIAL/FAIL global
- ANTI_AI_CHECKLIST: PARTIAL/FAIL por cards, badges y variantes legacy
- RESPONSIVE_STATIC: PASS con limitación runtime
- ACCESSIBILITY_BASELINE: PARTIAL
- FUNCTIONAL_REGRESSION: NOT_VERIFIED por auditor; validación local posterior: tests/build PASS
- Overall: `AUDIT_FAIL`

### Validación local posterior

- `npm run build`: PASS; warning de chunk >500 kB fuera de alcance.
- `npm test`: 220 archivos, 1.390 tests, 0 fallos.
- `git diff --no-ext-diff --no-textconv --check`: PASS, con warnings de conversión LF/CRLF de Git.

## 17. Bloque final de deuda legacy — 2026-10-03

### Consistencia del informe

Se corrigió el recuento matemático del resumen anterior: `FIXED 3 + PARTIAL 14 + DEFERRED 1 + NOT_REPRODUCIBLE 0 = 18`. No se cambió el estado individual de ningún finding por la aritmética.

### Candidate lógico

- `src/modules/HistoricalTreasuryBackfillPanel.tsx`: migración del overlay legacy a `ModalShell`, con cierre bloqueado durante carga, foco/Escape/restauración heredados y región anunciable para resultado/error.
- `src/db/treasuryHistoricalBackfill137.test.ts`: aserciones sobre el uso de `ModalShell` y ausencia de `mini-modal` en ese panel.
- `AUDITORIA_VISUAL_UI_DMP_2026-10.md`: corrección de conteos y documentación del estado.

### Alcance no cerrado por esta intervención

Los catálogos card-first, headers/toolbars legacy, modales `.mini-modal` restantes, badges de metadatos, estilos inline dinámicos y microcopy técnico permanecen documentados como deuda parcial/deferred. Migrarlos exhaustivamente requeriría un candidate modular mayor y no se atribuye falsamente a este bloque.

### Estado estático

- `UI-F`: PASS para el candidate legacy revisado.
- `UI-H STATIC`: PASS para el candidate y la consistencia documental.
- `DESIGN_SYSTEM_COMPLIANCE`: PASS en el candidate revisado.
- `ANTI_AI_CHECKLIST`: PASS en el candidate revisado.
- `ACCESSIBILITY_BASELINE`: PASS tras añadir región `alert/status` al overlay migrado.
- `RESPONSIVE_STATIC`: PASS.
- `FUNCTIONAL_REGRESSION`: PASS con evidencia local posterior: targeted 10 archivos/47 tests, suite 220 archivos/1.390 tests sin fallos y build PASS.
- `RUNTIME_VISUAL_VALIDATION`: `VISUAL_RUNTIME_NOT_TESTED`.

### Dictamen final del candidate de deuda legacy

- UI-F: `PASS`
- UI-H STATIC: `PASS`
- DESIGN_SYSTEM_COMPLIANCE: `PASS`
- ANTI_AI_CHECKLIST: `PASS`
- ACCESSIBILITY_BASELINE: `PASS`
- RESPONSIVE_STATIC: `PASS`
- FUNCTIONAL_REGRESSION: `PASS`
- Overall: `AUDIT_PASS`

Este dictamen se limita al candidate identificado. La deuda global restante de catálogos, headers, toolbars, badges, inline styles y microcopy continúa registrada como `PARTIAL`/`DEFERRED` y no se declara cerrada por esta intervención.
