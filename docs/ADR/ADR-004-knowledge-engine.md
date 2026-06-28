# ADR-004 - Knowledge Engine / Inspeccion Tecnica Inteligente

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

Una empresa mantenedora pierde valor cuando el conocimiento queda en la memoria del tecnico, en fotos sueltas, mensajes de WhatsApp o partes incompletos. Los checklists tradicionales registran datos, pero no siempre generan conocimiento reutilizable.

## Decision

DoorManager Pro incorporara un Knowledge Engine basado en ITI: Inspeccion Tecnica Inteligente.

No se llamara solo checklist.

Toda reparacion, mantenimiento e instalacion debe generar inspeccion tecnica que documente estado, seguridad, operatividad, deficiencias, mejoras, fotos, mediciones y recomendaciones.

El sistema mantendra una biblioteca de conocimiento tecnico con manuales, esquemas, videos, errores frecuentes, averias habituales, repuestos compatibles, observaciones internas y aprendizaje propio de la empresa.

## Consecuencias

Ventajas:

- Preserva conocimiento tecnico.
- Mejora diagnosticos.
- Reduce errores.
- Ayuda a formar tecnicos.
- Genera oportunidades de mejora y presupuestos.
- Aumenta seguridad y trazabilidad.

Costes:

- Requiere modelado de checklists versionados.
- Requiere interfaz cuidada para no sobrecargar al tecnico.
- Requiere gobernanza del conocimiento interno.

## Reglas asociadas

- Cada intervencion debe dejar la instalacion mejor conocida que antes de la visita.
- Las deficiencias pueden generar presupuestos independientes.
- El cliente puede rechazar recomendaciones, pero debe quedar documentado.
- DoorManager recomienda, no decide por el cliente.
