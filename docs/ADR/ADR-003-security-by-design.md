# ADR-003 - Security by Design

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

DoorManager Pro gestionara informacion sensible: clientes, ubicaciones, puertas, partes, presupuestos, facturas, fotografias, firmas, manuales, historiales tecnicos, garantias y conocimiento interno.

Un incidente de seguridad puede afectar a clientes, reputacion, continuidad operativa y cumplimiento normativo.

## Decision

DoorManager Pro aplicara Security by Design y Zero Trust desde el inicio.

Principios:

- Autenticacion segura.
- Autorizacion por roles, permisos, modulo, accion y recurso.
- Minimo privilegio.
- Cifrado en transito.
- Proteccion de archivos.
- Auditoria de accesos y acciones criticas.
- Validacion de entradas.
- Proteccion contra inyeccion SQL, XSS, CSRF y ataques contra APIs.
- Backups cifrados y restauracion probada.
- RGPD/LOPDGDD desde el diseno.

## Consecuencias

Ventajas:

- Menor riesgo de fugas o manipulacion.
- Mayor confianza del cliente.
- Mejor capacidad de auditoria.
- Base solida para entornos industriales.

Costes:

- Mayor esfuerzo inicial.
- Requiere pruebas de seguridad.
- Requiere gestion de permisos fina.
- Requiere disciplina en logs y archivos.

## Reglas asociadas

- Ningun recurso sensible se expone sin autorizacion.
- Los archivos subidos se validan.
- Los logs no contienen secretos.
- Las acciones criticas quedan auditadas.
