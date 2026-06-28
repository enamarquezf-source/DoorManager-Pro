# DoorManager Pro - Manuales, documentacion e historial

| Campo | Valor |
| --- | --- |
| Version | 0.3 |
| Estado | Vivo |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-28 |

## Indice

Este documento mantiene su estructura actual y debe evolucionar con Gemelo Digital.

## Referencias cruzadas

- `docs/KNOWLEDGE_BASE/10_DIGITAL_TWIN.md`.
- `docs/PRODUCT_BIBLE.md`.

## Proximos desarrollos

- Separar historial por posicion fisica y equipo instalado.

## 1. Objetivo

Cada puerta debe conservar documentacion tecnica e historial completo de su vida operativa.

## 2. Documentacion

Contenido:

- Manuales.
- Esquemas electricos.
- Planos.
- PDF.
- Videos.
- Instrucciones.
- Documentacion tecnica.
- Presupuestos relacionados.
- Partes generados.
- Facturas relacionadas cuando proceda.

## 3. Servidor de archivos

Los archivos se almacenaran fuera de la base de datos relacional. PostgreSQL guardara metadatos, permisos y referencias.

Metadatos:

- Tipo.
- Nombre.
- Tamano.
- MIME.
- Checksum.
- Usuario de subida.
- Fecha.
- Entidad relacionada.
- Nivel de acceso.

## 4. Historial de puerta

Debe incluir:

- Montajes.
- Mantenimientos.
- Avisos.
- Incidencias.
- Averias.
- Partes de trabajo.
- Presupuestos.
- Material sustituido.
- Tecnico responsable.
- Tiempo invertido.
- Coste.
- Fotografias historicas.
- Informes.
- Firmas.

## 5. Proteccion de datos

- Acceso por permisos.
- Registro de descargas sensibles cuando proceda.
- Retencion segun politica.
- Descarga offline limitada a lo necesario.
- Proteccion de firmas y fotografias.

## 6. Criterios de aceptacion

- Cada puerta tiene documentacion e historial.
- La oficina puede consultar partes y presupuestos asociados.
- El tecnico puede descargar manuales necesarios offline.
- Los archivos estan protegidos por permisos.
