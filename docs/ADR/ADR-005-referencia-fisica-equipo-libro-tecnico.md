# ADR-005 - Referencia fisica, equipo instalado y Libro Tecnico

| Campo | Valor |
| --- | --- |
| Version | 0.1 |
| Estado | Aceptada |
| Fecha | 2026-06-29 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-29 |

## Estado

Aceptada.

## Contexto

En instalaciones industriales, una misma posicion puede mantener su utilidad durante muchos anos aunque el equipo real cambie por sustitucion, mejora o renovacion. Si se mezcla la posicion fisica con el equipo instalado, se pierden garantias, historiales, costes y trazabilidad tecnica.

Tambien es necesario que cada instalacion genere documentacion tecnica completa desde el primer momento, evitando equipos instalados sin pruebas, fotografias, garantia o validacion del cliente.

## Decision

DoorManager Pro separara tres conceptos:

- Referencia fisica: posicion estable dentro de la instalacion.
- Equipo instalado: objeto tecnico real con identificador interno inmutable.
- Libro Tecnico del Equipo: contenedor documental y tecnico del equipo instalado.

La referencia fisica permanece en el tiempo. Los equipos pueden sustituirse. Cada equipo conserva su propio historial, garantias, fotografias, ITI, deficiencias, presupuestos, reparaciones, mantenimientos y costes.

Cuando un equipo se sustituye completamente, el equipo antiguo queda historico y el nuevo ocupa la misma referencia fisica. El codigo visible del nuevo equipo anade una `S` por cada sustitucion completa, pero internamente debe existir un identificador inmutable distinto del codigo visible.

Cada equipo instalado debe generar un Libro Tecnico del Equipo desde el check de instalacion. La instalacion no se considera completa si no queda creado.

## Consecuencias

Ventajas:

- Trazabilidad real de la vida de cada posicion y equipo.
- Garantias asociadas al equipo correcto.
- Sustituciones sin perdida de historico.
- Mejor calculo de rentabilidad por equipo, cliente, marca, modelo y tipo de actuacion.
- Documentacion tecnica completa desde la instalacion.

Costes:

- Requiere modelar referencia fisica, equipo instalado y libro tecnico como conceptos separados.
- Requiere permisos para corregir relaciones entre partes, garantias y sustituciones.
- Requiere reglas claras para codigos visibles e identificadores internos.

## Reglas asociadas

- La garantia pertenece al equipo instalado, no a la referencia fisica ni al equipo anterior.
- Cada equipo nuevo genera su propio ciclo de garantia.
- Los equipos sustituidos no se borran.
- La cadena de sustituciones debe ser consultable.
- El Libro Tecnico del Equipo nace con el check de instalacion.
- La instalacion no se considera completa sin Libro Tecnico del Equipo.
