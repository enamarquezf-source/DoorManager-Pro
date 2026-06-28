# ADR-001 - Offline First

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

Los tecnicos trabajan en entornos industriales, sotanos, parkings, muelles de carga y zonas con cobertura limitada o inexistente. Una aplicacion que dependa de conexion continua fallaria precisamente cuando mas se necesita.

DoorManager Pro debe permitir completar partes, fotos, firmas, materiales, horas, checklist e inspecciones sin conexion.

## Decision

La aplicacion movil seguira arquitectura Offline First.

El flujo sera:

1. El tecnico pulsa `Cargar trabajos`.
2. El dispositivo descarga la informacion necesaria.
3. El tecnico trabaja localmente sin conexion.
4. El dispositivo guarda fotos, firmas, materiales, horas, checklist y observaciones localmente.
5. El tecnico pulsa `Enviar trabajo` cuando quiera sincronizar.
6. Si falla, nada se pierde y se permite reintento manual.

No se implementara sincronizacion continua como comportamiento principal.

## Consecuencias

Ventajas:

- Trabajo fiable sin cobertura.
- Menor consumo de datos.
- Mayor control del tecnico sobre el envio.
- Mejor experiencia en campo.

Costes:

- Mayor complejidad de sincronizacion.
- Necesidad de UUID para evitar duplicados.
- Control de conflictos por version.
- Auditoria de sincronizacion.
- Gestion segura de almacenamiento local.

## Reglas asociadas

- El tecnico no pierde datos si falla la conexion.
- Los reintentos no duplican registros.
- El sistema debe mostrar datos pendientes y errores.
- La oficina debe poder ver ultima sincronizacion conocida.
