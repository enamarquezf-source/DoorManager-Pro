# Auditoría runtime visual — DoorManager Pro

## Identificación

- Commit auditado: `869dbbf647a0bd2dcdc753f197c79bc1e2d8c6a5`
- URL: https://doormanager-pro.pages.dev/
- Build servido: `0.1.0-869dbbf647a0`
- Fecha de build declarada: `2026-10-03T22:26:25.305Z`
- Viewports solicitados: 1440×900, 768×1024, 390×844; adicionales 1366×768 y 412×915 no ejecutados.

## Evidencia accesible

- `build-info.json` sirve el commit esperado.
- La página principal responde con HTML válido, `lang="es"`, viewport responsive y bundle JavaScript/CSS.
- El contenido de la aplicación se monta client-side en `#root`.

## Estado de auditoría

**RUNTIME_VISUAL_AUDIT_PARTIAL**

El entorno disponible no proporciona navegador automatizado, captura de pantalla, ejecución JavaScript interactiva ni emulación de viewport. Por tanto no es posible observar de forma verificable login, shell autenticado, dashboards, módulos, modales, tablas, navegación, responsive, focus, touch targets u overflow.

## Pantallas y módulos

- Login: no verificable visualmente; la respuesta HTML sólo contiene el contenedor React.
- Shell global: no verificable.
- Dashboard: no verificable.
- CRM, Clientes, Centros, Equipos, SAT, Partes, Comercial, Oportunidades, Materiales, Almacén, Compras, Proveedores, Facturación, Cobros, Tesorería, Administración, Usuarios, Documentos, PRL, Vehículos y Avisos: no verificables sin sesión y navegador.
- Técnico/móvil: no verificable.
- Modales: no verificables.
- Tablas: no verificables.

## Findings

No se registran defectos visuales de producto porque no hubo observación visual runtime suficiente para sustentarlos.

### Limitación L-001

- Viewport: todos
- Módulo: auditoría
- Severidad: MEDIUM
- Categoría: VISUAL
- Descripción: no se pudo ejecutar recorrido visual interactivo ni capturar screenshots.
- Evidencia: sólo se obtuvo HTML inicial y `build-info.json`; la aplicación se monta en `#root` mediante JavaScript.
- Corrección sugerida: repetir con navegador automatizado o sesión interactiva autenticada.

### Limitación L-002

- Viewport: todos
- Módulo: aplicación autenticada
- Severidad: HIGH
- Categoría: INTERACTION
- Descripción: no se pudieron probar rutas protegidas, acciones, filtros, modales ni responsive autenticado.
- Evidencia: no hay sesión ni herramienta de interacción disponible.
- Corrección sugerida: ejecutar la auditoría en un navegador con credenciales de prueba autorizadas, sin mutar datos críticos.

## Resumen

- BLOCKER: 0
- HIGH: 0 findings de producto; 1 limitación de cobertura
- MEDIUM: 1 limitación
- LOW: 0
- TOTAL: 2 limitaciones, 0 defectos visuales confirmados

## Prioridades

- P0: ninguno confirmado.
- P1: habilitar entorno de navegador autenticado para completar la auditoría.
- P2: ninguno confirmado.
- P3: ninguno confirmado.

## Código y Git

- Código modificado: NO.
- Git ejecutado: NO.
- Commit/push: NO.

## Siguiente acción

Repetir `RUNTIME_VISUAL_VALIDATION` con navegador automatizado, los cinco viewports y una sesión de prueba autorizada.
