# Knowledge Base - Digital Twin

| Campo | Valor |
| --- | --- |
| Version | 0.3 |
| Estado | Conceptual |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-28 |

## Indice

1. Proposito
2. Concepto
3. Jerarquia
4. Posicion fisica y equipo instalado
5. Referencias cruzadas
6. Proximos desarrollos

## 1. Proposito

Preparar la arquitectura conceptual del Gemelo Digital de la instalacion.

No se implementa en esta fase.

## 2. Concepto

El Gemelo Digital representa la realidad tecnica de una instalacion, sus grupos de carga, equipos, componentes, estado, historial, documentacion, garantias, manuales e inspecciones.

## 3. Jerarquia

```text
Centro
  Grupo de carga
    Equipos
      Componentes
        Estado
        Historial
        Documentacion
        Garantias
        Manuales
        Inspecciones
```

## 4. Posicion fisica y equipo instalado

La posicion fisica permanece. Los equipos cambian. El historial nunca se pierde.

Un grupo de carga mantiene identidad aunque se sustituya puerta, plataforma, abrigo, retenedor, topes, calzos, semaforos u otros componentes.

## 5. Referencias cruzadas

- `01_EQUIPMENT_FAMILIES.md`.
- `03_COMPONENT_TYPES.md`.
- `09_ITI_ENGINE.md`.
- `docs/PRODUCT_BIBLE.md`.

## 6. Proximos desarrollos

- Definir entidades conceptuales del gemelo.
- Definir visualizacion por centro y grupo de carga.
- Definir historico por posicion fisica y equipo instalado.
