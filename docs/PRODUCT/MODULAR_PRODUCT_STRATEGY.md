# DoorManager Pro - Modular Product Strategy

| Campo | Valor |
| --- | --- |
| Version | 0.1 |
| Estado | Conceptual |
| Fecha | 2026-06-29 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-29 |

## 1. Proposito

Documentar la estrategia modular futura de DoorManager Pro sin convertirla todavia en implementacion comercial definitiva.

## 2. Principios

- En primeras versiones, todos los modulos podran estar disponibles gratuitamente.
- La arquitectura debe permitir modulos activables, desactivables, opcionales y asociados a planes o acuerdos comerciales.
- Debe utilizarse un modelo de capacidades o feature flags por empresa.
- Un modulo ya implantado mantiene su derecho de uso para esa empresa.
- Nunca se retira automaticamente un modulo ya implantado ni los datos generados con el.

## 3. Separacion de conceptos

Debe separarse claramente:

- Derecho de uso del modulo implantado.
- Servicios continuados.
- Alojamiento.
- Soporte.
- Mantenimiento.
- Integraciones.
- Nuevas ampliaciones.

## 4. Entidades conceptuales

- CompanyCapability: capacidad activa o disponible para una empresa.
- ImplementedModuleRight: derecho de uso de un modulo ya implantado, independiente de servicios futuros.

## 5. Documentos relacionados

- `docs/PRODUCT_BIBLE.md`.
- `docs/PROJECT_DNA.md`.
- `docs/BUSINESS_RULES.md`.
- `docs/03-modelo-datos.md`.
