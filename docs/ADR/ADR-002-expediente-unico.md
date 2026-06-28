# ADR-002 - Expediente Unico

| Campo | Valor |
| --- | --- |
| Version | 0.3 |
| Estado | Aceptada |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-28 |

## Estado

Aceptada.

## Contexto

Los procesos reales no son entidades aisladas. Un aviso puede generar parte, presupuesto, factura, garantia, fotos, firma, documentos y deficiencias. Si estos elementos quedan dispersos, se pierde trazabilidad y contexto.

## Decision

DoorManager Pro usara el Expediente Unico como contenedor trazable desde el primer contacto.

El expediente podra agrupar:

- Avisos.
- Partes.
- Presupuestos.
- Facturas.
- Garantias.
- Fotos.
- Firmas.
- Auditoria.
- Deficiencias.
- Documentos.
- Comunicaciones.

Solo usuarios autorizados podran generar expedientes.

## Consecuencias

Ventajas:

- Trazabilidad completa.
- Mejor busqueda.
- Mejor contexto para oficina, SAT, comercial y gerencia.
- Facilita auditoria y relacion con cliente.

Costes:

- Requiere modelado cuidadoso.
- Requiere codigo de expediente y motor de equivalencias.
- Requiere reglas claras de permisos.

## Reglas asociadas

- Todo proceso relevante nace o se vincula a expediente.
- La causa inicial no se sobrescribe.
- Las decisiones del cliente quedan documentadas.
- El buscador universal debe encontrar expedientes por codigos internos o externos.
