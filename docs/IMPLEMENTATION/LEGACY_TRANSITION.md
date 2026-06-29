# DoorManager Pro - Legacy Transition

| Campo | Valor |
| --- | --- |
| Version | 0.1 |
| Estado | Conceptual |
| Fecha | 2026-06-29 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-29 |

## 1. Proposito

Documentar la convivencia progresiva entre DoorManager Pro y sistemas anteriores.

## 2. Principios

- DMP debe permitir que el sistema antiguo y DMP funcionen simultaneamente durante una transicion.
- La empresa cliente decide cuando retirar el sistema anterior.
- La referencia externa debe ser generica y no depender de un ERP concreto.
- No se implementan todavia conectores especificos.

## 3. Datos a registrar

Debe poder registrarse:

- Sistema de origen.
- Referencia externa.
- Identificador externo.
- Numero de OT, pedido, factura o expediente.
- Enlace externo, cuando exista.
- Observaciones.
- Estado de migracion.

## 4. Entidad conceptual

ExternalReference representa una vinculacion generica entre una entidad de DMP y una referencia externa.

## 5. Documentos relacionados

- `docs/03-modelo-datos.md`.
- `docs/IMPLEMENTATION/IMPLEMENTATION_AND_ADOPTION.md`.
