# DoorManager Pro — UI Design System

## Propósito

Este documento define el lenguaje visual y las reglas de UX de DoorManager Pro. El producto es software B2B para operaciones de puertas automáticas, mantenimiento, SAT, almacén, administración, facturación y técnicos de campo.

La interfaz debe sentirse como una herramienta empresarial real: rápida, clara, madura, sobria, consistente y orientada a datos y acciones. La claridad operativa tiene prioridad sobre la decoración.

## 1. Principios visuales

### Interacción común de registros

- Un registro con una ficha debe poder abrirse desde toda su superficie mediante un enlace nativo, también con teclado.
- Las acciones secundarias conservan su área independiente; pulsar archivar o editar no debe abrir la ficha.
- Mostrar nombre, contexto y estado antes de entrar. Reservar los detalles extensos para desplegables.
- Usar el mismo tratamiento de hover, foco y destino en equipos, materiales, checks y partes.
- En el técnico móvil, los desplegables por equipo muestran únicamente información técnica relevante y cargan al abrirse.
- Evitar convertir texto informativo en controles sin una acción útil.

Referencias: [NN/g: tarjetas](https://www.nngroup.com/articles/cards-component/), [NN/g: divulgación progresiva](https://www.nngroup.com/articles/progressive-disclosure/), [WCAG 2.2](https://www.w3.org/TR/WCAG/).

- Priorizar contenido, contexto y operaciones.
- Mantener una densidad media: suficiente información visible sin saturar.
- Construir una jerarquía visual fuerte y predecible.
- Usar espacios consistentes, superficies planas y estructura antes que sombras.
- Mantener bordes discretos y radios moderados.
- Usar colores con significado semántico estable.
- Usar tipografía sobria, legible y adecuada para datos.
- Hacer evidentes las acciones primarias y reducir el protagonismo de las secundarias.
- Diferenciar módulos por contenido y navegación, no por cambiar completamente la estética.

### Evitar

- Gradientes de fondo sin función, glow y glassmorphism.
- Sombras grandes o sombras usadas como separador universal.
- Radios exagerados y tarjetas flotantes en exceso.
- Iconos decorativos sin función o dentro de círculos por defecto.
- Badges para cada dato y fondos pastel arbitrarios.
- Títulos gigantes, whitespace excesivo, botones enormes y centrar todo.
- Layouts de landing page, demos Dribbble o plantillas SaaS decorativas.

## 2. Jerarquía de una página

Las páginas de gestión deben seguir una estructura reconocible:

1. **Título de página**.
2. **Contexto o subtítulo** que explique el alcance cuando sea necesario.
3. **Acciones primarias** de la pantalla.
4. **Búsqueda y filtros** accesibles.
5. **Contenido principal**.

No encapsular automáticamente cada sección en una card. Preferir secciones, filas, paneles y layouts divididos. Una card sólo debe existir cuando haya una agrupación semántica real.

## 3. Componentes y patrones

### Headers y toolbars

- El header debe identificar claramente la página y su contexto.
- Las acciones deben agruparse por propósito, con una única acción primaria por zona.
- Las toolbars deben colocar búsqueda, filtros y acciones frecuentes cerca del contenido que controlan.
- No introducir controles decorativos ni acciones ambiguas.

### Cards y paneles

- Reservar las cards para KPIs, resúmenes semánticos, grupos independientes y dashboards.
- Preferir paneles estructurales para contenido operativo.
- No repetir el patrón `card + círculo de icono + título + texto + badge` por toda la aplicación.
- No anidar varias capas de cards alrededor de una tabla.

### Tablas

Las tablas son una pieza principal de DoorManager Pro:

- Filas compactas, legibles y con altura consistente.
- Encabezados claros y alineación coherente por tipo de dato.
- Hover discreto, sin efectos llamativos.
- Acciones de fila agrupadas y previsibles.
- Columnas prioritarias visibles; códigos menos prominentes que nombres.
- Estados legibles mediante texto y color semántico cuando proceda.
- Filtros accesibles y próximos a la tabla.
- Paginación clara, con contexto del resultado cuando sea útil.
- Evitar tablas dentro de múltiples cards anidadas.

### Formularios

- Labels siempre visibles; un placeholder nunca sustituye a un label.
- Agrupar campos por lógica de negocio y mantener juntos los relacionados.
- Usar anchuras coherentes según el tipo de dato.
- Mostrar la validación junto al campo y explicar cómo corregirlo.
- Colocar las acciones al final del formulario.
- Usar un único botón primario y diferenciar claramente los secundarios.
- En móvil, reducir la complejidad y priorizar el flujo de trabajo.

### Botones

| Nivel | Uso |
| --- | --- |
| **Primary** | Acción principal de la página o del flujo actual. |
| **Secondary** | Acciones habituales complementarias. |
| **Tertiary / Ghost** | Acciones auxiliares o de baja prominencia. |
| **Danger** | Acción destructiva o irreversible, siempre con contexto suficiente. |

Reglas: no usar varios primarios en la misma zona, no asignar colores arbitrarios, no usar botones enormes y evitar el formato pill salvo que exista una razón funcional específica.

### Modales y drawers

- Usar un modal para una decisión o tarea breve que requiera foco.
- Usar un drawer para consultar o editar contexto sin perder la lista o pantalla de origen.
- El título debe expresar la tarea; las acciones deben ser inequívocas.
- Mantener el contenido ajustado a la tarea y adaptar ambos patrones al viewport móvil.
- Las sombras sólo están justificadas para modales, dropdowns y menús flotantes.

### Tabs, filtros y badges

- Usar tabs sólo para vistas hermanas dentro del mismo contexto.
- Mantener filtros visibles, comprensibles y fáciles de limpiar.
- Un badge comunica estado, recuento o prioridad; no debe decorar ni sustituir información principal.
- No usar badges de color para datos que no representan un estado.

### Alertas, listas y paneles laterales

- Las alertas deben explicar qué ocurre, su gravedad y qué acción se requiere.
- Las listas deben favorecer escaneo rápido, con títulos claros y metadatos secundarios.
- Los paneles laterales deben conservar el contexto de origen y limitarse a información o acciones relacionadas.

### Sidebar y breadcrumbs

- La sidebar debe reflejar navegación y permisos, no decoración.
- Mantener una jerarquía de módulos estable y nombres consistentes.
- Usar breadcrumbs cuando la profundidad o el contexto lo necesiten; no añadirlos a páginas planas.

### Estados vacíos, loading y errores

- Un estado vacío explica por qué no hay datos y ofrece la siguiente acción útil cuando exista.
- Loading debe conservar la estructura esperada y evitar saltos innecesarios.
- Un error debe ser directo, indicar impacto y ofrecer recuperación o siguiente paso.
- Los estados deben comunicar siempre estado real, gravedad y acción necesaria.

## 4. Escala visual

### Radio

Usar una escala pequeña y consistente, con radios moderados:

- `0`: elementos que deben sentirse estructurales o de tabla.
- `4px`: controles, campos y elementos compactos.
- `6px`: botones, paneles y cards estándar.
- `8px`: superficies que necesiten una separación algo más visible.

No aplicar radios de 16–24px de forma generalizada.

### Elevación

La separación principal se consigue con layout, espaciado y bordes. Usar sombra sólo cuando haya elevación real: modal, dropdown o menú flotante. No usar sombras para separar todas las cards o filas.

### Color semántico

Los tokens deben conservar el mismo significado en todos los módulos:

| Token | Función |
| --- | --- |
| `background` | Fondo general de la aplicación. |
| `surface` | Superficie de contenido y controles. |
| `border` | Separación discreta y estructura. |
| `primary` | Acción, foco o selección principal. |
| `text` | Texto principal y datos prioritarios. |
| `muted text` | Metadatos, ayuda y contexto secundario. |
| `success` | Resultado correcto o estado operativo favorable. |
| `warning` | Atención requerida sin fallo crítico. |
| `danger` | Error, bloqueo o acción destructiva. |
| `info` | Información contextual neutral. |

No usar colores decorativos distintos por módulo salvo justificación UX documentada.

## 5. Tipografía, iconos y microcopy

- La tipografía debe ser sobria, legible y optimizada para lectura de tablas y formularios.
- La jerarquía se construye con tamaño, peso y espaciado; no con títulos gigantes.
- Los iconos deben ser funcionales, consistentes y de tamaño uniforme.
- No usar círculos decorativos alrededor de iconos por defecto.
- Añadir texto junto al icono cuando la acción pueda ser ambigua.
- El microcopy debe ser claro, directo, profesional y orientado a acción.

Evitar frases vagas o promocionales. Preferir `Clientes` o `Gestiona clientes, centros y contactos.` frente a `Gestiona fácilmente todos tus increíbles clientes`.

## 6. Dashboard orientado a operación

El dashboard debe ayudar a decidir y actuar, no ser una colección de cards decorativas. Priorizar, según el contexto y permisos:

- Trabajo pendiente.
- Incidencias.
- Vencimientos.
- KPIs útiles para la operación.
- Acciones rápidas reales.

## 7. Móvil y técnico de campo

- Mantener las acciones clave siempre accesibles.
- Usar targets táctiles adecuados y formularios simples.
- Evitar overflow horizontal accidental.
- Mantener la cabecera compacta.
- Usar acciones inferiores o primarias persistentes cuando el flujo lo requiera.
- Adaptar modales y drawers al viewport.
- Respetar permisos: los costes no deben mostrarse al técnico si no tiene autorización.

## 8. Consistencia entre módulos

CRM, SAT, Comercial, Almacén, Administración, Facturación y Tesorería deben sentirse parte del mismo producto. No crear un estilo nuevo para cada módulo. La especialización debe venir del contenido, los datos, la navegación y las acciones, no de cambios completos de color o estética.

Referencias de tono conceptual, sin copiar: Linear, GitHub, Stripe Dashboard, Atlassian, Notion y ERP/CRM modernos. La referencia común es la claridad operativa.

## 9. ANTI-AI UI CHECKLIST

Antes de aprobar una pantalla, comprobar:

- ¿Hay demasiadas cards?
- ¿Se usa una card donde bastaría una section?
- ¿Hay radios exagerados?
- ¿Hay sombras innecesarias?
- ¿Hay gradientes decorativos?
- ¿Hay iconos dentro de círculos sin función?
- ¿Hay badges innecesarios?
- ¿Hay demasiado whitespace?
- ¿Parece una landing SaaS en lugar de software operativo?
- ¿Las acciones principales están claras?
- ¿La densidad es adecuada?
- ¿La información importante domina sobre la decoración?
- ¿El diseño parece consistente con el resto del producto?

Si varias respuestas son problemáticas, rediseñar antes de considerar terminado el cambio.

## 10. Componentes canónicos

Estos nombres representan patrones compartidos que deben reutilizarse cuando se implementen. Son especificaciones de diseño, no una obligación de crearlos todos en esta tarea.

| Componente | Contrato visual y de UX |
| --- | --- |
| `PageHeader` | Título, contexto opcional y una zona de acciones; sigue la estructura estándar de página. |
| `SectionHeader` | Título de una sección, descripción breve opcional y acciones locales; no añade decoración. |
| `toolbar` | Búsqueda, filtros y acciones relacionadas en una única fila adaptable. |
| `DataTable` | Cabeceras claras, filas compactas, columnas prioritarias, hover discreto, acciones agrupadas y paginación. |
| `FilterBar` | Filtros etiquetados, accesibles, limpiables y próximos al contenido filtrado. |
| `FormSection` | Agrupación lógica de campos con labels visibles, anchuras coherentes y validación inline. |
| `Modal` | Tarea breve que requiere foco; título claro, contenido acotado y footer con una acción primaria. |
| `Drawer` | Consulta o edición contextual sin perder la pantalla de origen; adaptado a móvil. |
| `Tabs` | Vistas hermanas del mismo contexto; una selección activa claramente identificable. |
| `StatusBadge` | Estado, prioridad, severidad o clasificación útil; nunca metadato decorativo. |
| `EmptyState` | Explica la ausencia de datos y ofrece el siguiente paso útil. |
| `ErrorState` | Explica el impacto, permite recuperación y evita detalles técnicos innecesarios. |
| `LoadingState` | Conserva la estructura de la pantalla y comunica que el contenido está cargando. |
| `ActionMenu` | Agrupa acciones de fila o contexto sin multiplicar botones primarios. |
| `DetailPage` | Cabecera contextual, acciones, resumen estructurado y secciones relacionadas. |
| `KPI` / `KpiBlock` | Métrica operativa accionable, con unidad, periodo y enlace o contexto verificable. |

Regla de implementación futura: un nuevo módulo debe buscar primero un componente canónico existente antes de introducir una variante local. Si necesita una variante, debe conservar la jerarquía, espaciado, color semántico y densidad de este documento.

## 11. Aplicación

Este sistema es la referencia común para nuevas pantallas y cambios visuales. No exige rediseñar de una vez la aplicación existente: cada cambio futuro debe mejorar la consistencia, la claridad operativa y la densidad adecuada dentro de su alcance.
