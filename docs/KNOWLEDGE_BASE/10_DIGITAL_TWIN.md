# Knowledge Base - Digital Twin

| Campo | Valor |
| --- | --- |
| Version | 0.4 |
| Estado | Conceptual |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-29 |

## Indice

1. Proposito
2. Concepto
3. Jerarquia
4. Referencia fisica y equipo instalado
5. Sustituciones y linea de vida
6. Libro Tecnico del Equipo
7. Referencias cruzadas
8. Proximos desarrollos

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

## 4. Referencia fisica y equipo instalado

La referencia fisica identifica una posicion estable dentro de la instalacion. Puede ser un muelle, posicion, grupo de carga, codigo cliente u otra ubicacion funcional.

El equipo instalado es el objeto tecnico real. Tiene fabricante, modelo, numero de serie, fecha de instalacion, garantia, documentacion e historial.

La referencia fisica permanece. Los equipos evolucionan. El historial nunca se pierde.

Un grupo de carga mantiene identidad aunque se sustituya puerta, plataforma, abrigo, retenedor, topes, calzos, semaforos u otros componentes.

Cada equipo instalado debe disponer de un identificador interno inmutable distinto del codigo visible.

## 5. Sustituciones y linea de vida

Cuando un equipo se sustituye completamente:

- El equipo antiguo queda historico.
- No se borra.
- El nuevo equipo ocupa la misma referencia fisica.
- El codigo visible añade una `S` por cada sustitucion completa.

Ejemplo:

```text
26011001    -> equipo original
26011001S   -> primera sustitucion
26011001SS  -> segunda sustitucion
26011001SSS -> tercera sustitucion
```

Cada referencia fisica debe conservar su linea de vida:

```text
Referencia fisica
  -> Equipo original
  -> Equipo sustituido
  -> Equipo actual
```

Cada equipo conserva su propio historial, garantias, fotografias, ITI, deficiencias, presupuestos, reparaciones, mantenimientos y costes.

La garantia pertenece al equipo instalado, no a la referencia fisica ni al equipo anterior. Cada equipo nuevo genera su propio ciclo de garantia y no hereda garantia de equipos anteriores.

## 6. Libro Tecnico del Equipo

Cada equipo instalado debe generar un Libro Tecnico del Equipo desde el check de instalacion. La instalacion no se considera completa si no queda creado.

El Libro Tecnico forma parte del Gemelo Digital y debe seguir al equipo concreto durante toda su vida, incluso si queda historico por sustitucion.

## 7. Referencias cruzadas

- `01_EQUIPMENT_FAMILIES.md`.
- `03_COMPONENT_TYPES.md`.
- `09_ITI_ENGINE.md`.
- `docs/PRODUCT_BIBLE.md`.
- `docs/ADR/ADR-005-referencia-fisica-equipo-libro-tecnico.md`.

## 8. Proximos desarrollos

- Definir entidades conceptuales del gemelo.
- Definir visualizacion por centro y grupo de carga.
- Definir historico por posicion fisica y equipo instalado.
