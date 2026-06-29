# DoorManager Pro - Manuales, documentacion e historial

| Campo | Valor |
| --- | --- |
| Version | 0.4 |
| Estado | Vivo |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-29 |

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

## 4.1 Historial tecnico del equipo

Cuando un componente esta averiado y se sustituye, debe quedar reflejado en el historial del equipo.

Debe distinguirse:

- Reparacion del mismo componente.
- Sustitucion por un componente nuevo.

En sustituciones debe constar:

- Componente sustituido.
- Componente nuevo.
- Fecha.
- Parte.
- Tecnico.
- Causa.
- Pruebas.
- Resultado.

Las sucesivas sustituciones y reincidencias forman parte del historial tecnico cronologico del equipo.

La logistica y la garantia del proveedor pertenecen al area de compras y proveedores. La instalacion, pruebas y resultado pertenecen al area tecnica. Ambas areas se relacionan, pero no se mezclan.

## 4.2 Busqueda tecnica transversal

El buscador debe permitir trabajar sobre un equipo, varios equipos, un centro, un cliente, una familia o todo el parque tecnico.

Filtros previstos:

- Componente.
- Marca.
- Modelo.
- Averia.
- Reparacion.
- Sustitucion.
- Tecnico.
- Fecha.
- Garantia.
- Reincidencia.
- Cliente.
- Centro.
- Expediente.
- Parte.
- Tipo de equipo.
- Resultado.

Debe respetar permisos y aislamiento de datos. No se priorizan todavia consultas guardadas.

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
