# DoorManager Pro - Knowledge Engine

| Campo | Valor |
| --- | --- |
| Version | 0.4 |
| Estado | Vivo |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-29 |

## Indice

1. Concepto
2. ITI
3. Informes inteligentes
4. Motor de deficiencias
5. Riesgo y seguridad
6. Biblioteca de conocimiento
7. Motor de compatibilidades
8. Relacion con Gemelo Digital
9. Libro Tecnico del Equipo
10. Garantias, reincidencias y rentabilidad
11. Documentos relacionados
12. Proximos desarrollos

## 1. Concepto

DoorManager Pro no almacena solamente datos. Conserva conocimiento.

El Knowledge Engine transforma intervenciones tecnicas en conocimiento reutilizable por la empresa. Cada intervencion puede enriquecer averias frecuentes, recomendaciones, checklists, procedimientos y observaciones.

Principio fundamental:

> Cada intervencion debe dejar la instalacion mejor conocida que antes de la visita.

## 2. ITI

ITI significa Inspeccion Tecnica Inteligente.

Toda actuacion genera una ITI. No importa si es reparacion, mantenimiento o instalacion. Toda intervencion finaliza con una evaluacion tecnica.

Reparacion incluye:

- Averia comunicada.
- Trabajo realizado.
- Estado general del equipo.
- Deficiencias detectadas.
- Mejoras posibles.

Mantenimiento incluye:

- Inspeccion completa.
- Deficiencias.
- Mejoras.
- Recomendaciones.

Instalacion incluye:

- Checklist de instalacion.
- Pruebas.
- Tipo de uso.
- Manuales entregados.
- Garantia.
- Mejoras futuras posibles.
- Creacion del Libro Tecnico del Equipo.

Los checklists pueden ser genericos por tipo de equipo, especificos por marca/modelo o personalizados por cliente. Deben tener versionado.

## 3. Informes inteligentes

Toda actuacion puede generar:

1. Informe tecnico.
2. Informe de deficiencias.
3. Informe de riesgos.
4. Oportunidades comerciales.
5. Recomendaciones tecnicas.
6. Presupuestos derivados.

El objetivo no es generar papeles, sino producir decisiones documentadas y accionables.

## 4. Motor de deficiencias

Cada deficiencia debe disponer de:

- Estado.
- Prioridad.
- Seguridad.
- Operatividad.
- Criticidad.
- Fotografias.
- Recomendacion.
- Presupuesto.
- Estado comercial.
- Historial.

No desaparece hasta ser resuelta o rechazada.

Estados propuestos:

- Pendiente.
- Presupuestada.
- Aceptada.
- Rechazada.
- Resuelta.

Si el cliente rechaza una deficiencia o reparacion, queda reflejado en el parte y firma.

## 5. Riesgo y seguridad

Cada punto de inspeccion puede tener:

- Estado tecnico.
- Seguridad.
- Operatividad.
- Criticidad para el cliente.

Estados tecnicos:

- Correcto.
- Desgaste.
- Averiado.
- Ajustado y verificado.
- Pendiente de reparacion.
- No operativo.
- Funcional con limitaciones.

Seguridad:

- Seguro.
- Riesgo bajo.
- Riesgo medio.
- Riesgo alto.
- Riesgo critico.

Debe poder marcarse equipo bloqueado o no apto. Si el cliente decide seguir usando el equipo, queda documentado y firmado.

DoorManager recomienda, no decide por el cliente.

## 6. Biblioteca de conocimiento

El conocimiento validado podra incorporarse posteriormente a:

- Averias frecuentes.
- Recomendaciones.
- Checklist.
- Procedimientos.
- Observaciones.
- Manuales.
- Esquemas.
- Videos.
- Repuestos compatibles.

## 7. Motor de compatibilidades

El Knowledge Engine preparara un motor de compatibilidades.

Ejemplo conceptual:

```text
Motor
  Puertas compatibles
  Cuadros compatibles
  Fotocelulas compatibles
  Encoders compatibles
  Repuestos compatibles
```

No se implementa en esta fase, pero la arquitectura documental y de datos debe prepararse para ello.

## 8. Relacion con Gemelo Digital

La ITI alimenta el Gemelo Digital de la instalacion:

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

La ITI debe alimentar la linea de vida de cada referencia fisica y de cada equipo instalado. Cuando un equipo se sustituye, la informacion tecnica queda asociada al equipo concreto que la genero, no solo a la posicion.

## 9. Libro Tecnico del Equipo

El Libro Tecnico del Equipo es el contenedor de conocimiento tecnico de un equipo instalado. Nace con el check de instalacion y se enriquece con cada intervencion posterior.

Contenido minimo:

- Fabricante.
- Modelo.
- Numero de serie.
- Tipo de equipo.
- Referencia fisica donde queda instalado.
- Fotografias.
- Check de instalacion.
- Pruebas de funcionamiento.
- Pruebas de seguridad.
- Tipo de uso previsto.
- Manuales.
- Declaraciones o certificados si procede.
- Garantia.
- Observaciones tecnicas.
- Recomendaciones futuras.
- Posibles mejoras.
- Firma o validacion del cliente.
- Historial posterior de reparaciones, mantenimientos, deficiencias, garantias e ITI.

La instalacion no se considera completa si no queda creado el Libro Tecnico del Equipo.

## 10. Garantias, reincidencias y rentabilidad

El Knowledge Engine debe distinguir entre causa tecnica y decision comercial.

SAT evalua si una averia puede ser garantia, reincidencia, error de montaje, defecto de material, mal uso, golpe externo, desgaste, falta de mantenimiento u otra causa. El comercial asignado al cliente decide la facturacion final.

Las garantias y reincidencias deben conservar conocimiento y coste:

- Parte original vinculado.
- Motivo tecnico.
- Decision comercial.
- Horas.
- Desplazamiento.
- Material.
- Coste interno.
- Importe facturado o no facturado.
- Rentabilidad real.

## 11. Documentos relacionados

- `docs/PRODUCT_BIBLE.md`.
- `docs/KNOWLEDGE_BASE/09_ITI_ENGINE.md`.
- `docs/KNOWLEDGE_BASE/07_COMPATIBILITY_ENGINE.md`.
- `docs/KNOWLEDGE_BASE/10_DIGITAL_TWIN.md`.
- `docs/ADR/ADR-004-knowledge-engine.md`.
- `docs/ADR/ADR-005-referencia-fisica-equipo-libro-tecnico.md`.

## 12. Proximos desarrollos

- Definir modelo de deficiencias.
- Definir versionado de checklists.
- Definir reglas de promocion de conocimiento validado.
- Definir compatibilidades entre componentes.
