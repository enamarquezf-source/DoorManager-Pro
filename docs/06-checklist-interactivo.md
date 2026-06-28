# DoorManager Pro - Checklist interactivo

## 1. Objetivo

El checklist interactivo es un modulo central de DoorManager Pro. Su objetivo es permitir que un tecnico revise una puerta/equipo mediante un esquema visual, pulsando zonas concretas de la puerta para abrir la comprobacion correspondiente.

El modulo debe servir tanto para comprobaciones de montaje como para comprobaciones de mantenimiento, manteniendo un historial propio por cada puerta/equipo.

## 2. Principios funcionales

- Cada puerta/equipo tiene su propio historial de checks.
- Las comprobaciones son unicas para cada puerta/equipo.
- Cada comprobacion se compone de zonas interactivas.
- Cada zona se registra de forma independiente.
- El estado visual del esquema debe reflejar los datos guardados.
- Solo usuarios con permisos adecuados pueden ver o modificar comprobaciones.
- La experiencia debe ser usable en ordenador, movil y tablet.

## 3. Tipos de comprobacion

Tipos iniciales:

- Montaje.
- Mantenimiento.

Las comprobaciones de montaje se orientan a instalacion, puesta en marcha y validacion inicial.

Las comprobaciones de mantenimiento se orientan a revisiones preventivas, correctivas o inspecciones periodicas.

## 4. Partes interactivas iniciales

El esquema visual de la puerta debe incluir, como minimo, las siguientes zonas pulsables:

- Motor.
- Cuadro de maniobra.
- Fotocelulas.
- Guias.
- Hoja u hojas moviles.
- Radar o detector.
- Selector de funciones.
- Bateria.
- Finales de carrera.
- Sistema antiaplastamiento.
- Cerradura o desbloqueo manual.

Cada zona debe tener un codigo tecnico estable para persistencia y una etiqueta legible para la interfaz.

## 5. Estados por zona

Estados iniciales:

- Correcto.
- Pendiente.
- Revisar.
- Averia.

Significado recomendado:

| Estado | Uso |
| --- | --- |
| Correcto | La zona esta comprobada y no presenta incidencias |
| Pendiente | La zona aun no ha sido comprobada o queda trabajo por completar |
| Revisar | La zona necesita seguimiento o comprobacion adicional |
| Averia | La zona presenta fallo o requiere intervencion |

## 6. Datos por zona comprobada

Cada zona comprobada debe poder registrar:

- Estado.
- Observaciones.
- Fotografias.
- Fecha y hora.
- Tecnico responsable.
- Firma o validacion si procede.

La fecha y el tecnico responsable deben permitir reconstruir quien realizo cada parte de la comprobacion.

## 7. Flujo de uso

Flujo principal:

1. El usuario accede a una puerta/equipo.
2. El sistema muestra su ficha e historial de checks.
3. El usuario inicia o abre una comprobacion de montaje o mantenimiento.
4. El frontend muestra el esquema visual de la puerta.
5. El usuario pulsa una zona interactiva.
6. Se abre el formulario de comprobacion de esa zona.
7. El usuario informa estado, observaciones y fotografias si procede.
8. El sistema guarda el check mediante la API REST.
9. El esquema actualiza el color o indicador visual de la zona.
10. La comprobacion queda registrada en el historial del equipo.

## 8. Comportamiento visual recomendado

El esquema debe mostrar claramente el estado de cada zona.

Codificacion visual inicial recomendada:

- Correcto: verde.
- Pendiente: gris o amarillo suave.
- Revisar: naranja.
- Averia: rojo.

La interfaz no debe depender solo del color. Tambien debe mostrar texto, icono o etiqueta para mejorar accesibilidad.

## 9. Requisitos responsive

En escritorio:

- El esquema y el detalle de zona pueden mostrarse en columnas.
- Debe aprovecharse el espacio para mostrar historial o resumen lateral.

En tablet:

- El esquema debe seguir siendo pulsable con dedos.
- Los formularios deben tener controles grandes y claros.

En movil:

- El esquema debe adaptarse al ancho disponible.
- Las zonas deben tener area tactil suficiente.
- El formulario puede abrirse como pantalla completa o panel inferior.
- La subida de fotografias debe funcionar desde camara o galeria si el navegador lo permite.

## 10. Reglas de negocio

- No puede existir un check sin puerta/equipo asociado.
- Una zona no debe duplicarse dentro de la misma comprobacion.
- El estado de una comprobacion puede depender del estado de sus zonas.
- Una comprobacion con zonas en averia o revisar no debe considerarse completamente correcta sin validacion.
- La validacion o firma, si procede, debe registrar usuario y fecha.
- Un tecnico solo puede modificar comprobaciones asignadas salvo permiso explicito.

## 11. Seguridad y permisos

Permisos minimos candidatos:

- INSPECTIONS_READ.
- INSPECTIONS_WRITE.
- INSPECTIONS_VALIDATE.
- PHOTOS_UPLOAD.

Requisitos:

- El backend debe comprobar permisos antes de devolver o modificar checks.
- El frontend debe ocultar acciones no permitidas para mejorar experiencia.
- Las fotografias deben heredar permisos de la comprobacion asociada.
- La validacion debe requerir permiso especifico cuando afecte al cierre del proceso.

## 12. Historial por puerta/equipo

Cada puerta/equipo debe permitir consultar:

- Comprobaciones de montaje.
- Comprobaciones de mantenimiento.
- Fecha de cada comprobacion.
- Tecnico responsable.
- Estado general.
- Zonas con averia o a revisar.
- Fotografias asociadas.
- Validaciones realizadas.

Este historial debe conservarse aunque el equipo se desactive.

## 13. Criterios de aceptacion

- El usuario puede abrir una comprobacion desde la ficha de una puerta/equipo.
- El sistema muestra un esquema de puerta con zonas pulsables.
- Pulsar una zona abre la comprobacion correspondiente.
- Cada zona permite registrar estado, observaciones, fotografias, fecha y tecnico.
- Cada puerta/equipo conserva su historial propio.
- Un usuario sin permisos no puede consultar ni modificar comprobaciones restringidas.
- El checklist funciona en ordenador, movil y tablet.
