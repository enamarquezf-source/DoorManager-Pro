# DoorManager Pro - Exports and Templates

| Campo | Valor |
| --- | --- |
| Version | 0.1 |
| Estado | Conceptual |
| Fecha | 2026-06-29 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-29 |

## 1. Proposito

Definir exportaciones, informes y plantillas personalizables.

## 2. Exportaciones

Los resultados podran exportarse a Excel y PDF.

Modos:

- Informe detallado.
- Resumen configurable.

En el resumen, el usuario seleccionara que campos incluir.

Las exportaciones deben respetar filtros, permisos, alcance, empresa, usuario, fecha y hora.

## 3. Plantillas personalizables

Cada empresa podra disponer de varias plantillas: informe tecnico, mantenimiento, instalacion, resumen para cliente, aseguradora, listado interno, incidencias y otras configurables.

Las plantillas podran incluir logotipo, datos fiscales, colores, cabecera, pie, numeracion, textos legales, firma, sello, campos y orden.

La implementacion de textos legales y requisitos documentales debera validarse posteriormente segun normativa aplicable.

## 4. Fotografias en informes

Al generar un PDF, debe poder elegirse:

- Todas las fotografias.
- Solo las fotografias marcadas como relevantes.
- Ninguna fotografia.

La seleccion depende del informe, usuario y permisos.

## 5. Entidades conceptuales

- ExportTemplate.
- ReportExport.
- PhotoReportSelection.

## 6. Documentos relacionados

- `docs/03-modelo-datos.md`.
- `docs/OPERATIONS/TECHNICAL_HISTORY_AND_SEARCH.md`.
- `docs/PORTALS/CLIENT_PORTAL.md`.
