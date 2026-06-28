# DoorManager Pro - Offline-first

| Campo | Valor |
| --- | --- |
| Version | 0.3 |
| Estado | Vivo |
| Fecha | 2026-06-28 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-28 |

## Indice

Este documento mantiene la estructura offline-first actual.

## Referencias cruzadas

- `docs/ADR/ADR-001-offline-first.md`.
- `docs/PRODUCT_BIBLE.md`.

## Proximos desarrollos

- Definir contrato de paquetes offline para ITI y Gemelo Digital.

## 1. Objetivo

La app movil debe permitir trabajo completo sin conexion. Este requisito es critico para tecnicos en poligonos, sotanos, parkings o zonas sin cobertura.

## 2. Principios

- No sincronizacion constante.
- No peticiones continuas.
- Boton `Cargar trabajos`.
- Trabajo local.
- Boton `Enviar trabajo`.
- Reintento manual.
- Estado visible.
- UUID para duplicados.
- Version para conflictos.
- Auditoria.

## 3. Cargar trabajos

Debe descargar:

- Partes asignados.
- Datos de clientes necesarios.
- Instalaciones.
- Puertas.
- Checklists.
- Historial basico.
- Manuales necesarios.
- Fotografias necesarias.
- Materiales.
- Permisos.

## 4. Trabajo local

Debe guardar:

- Horas.
- Desplazamientos.
- Materiales usados.
- Material pendiente.
- Observaciones.
- Fotos.
- Firmas.
- Checklist.
- Incidencias.
- Resultado del trabajo.

## 5. Enviar trabajo

Debe enviar:

- Parte completado.
- Cambios de estado.
- Fotos.
- Firmas.
- Materiales.
- Respuestas de checklist.
- Auditoria local.

Si falla, los datos siguen guardados y se puede reintentar.

## 6. Conflictos

- Detectar cambios concurrentes por version.
- No sobrescribir datos sin control.
- Registrar conflicto.
- Permitir resolucion por oficina o jefe de equipo.

## 7. Seguridad

- Descargar solo datos necesarios.
- Proteger almacenamiento local si la tecnologia lo permite.
- No guardar secretos.
- Limpiar datos locales cerrados segun politica.

## 8. Criterios de aceptacion

- El tecnico completa un parte sin Internet.
- Fotos, firmas, materiales y horas no se pierden.
- El envio puede reintentarse.
- No se duplican registros.
- Los conflictos quedan registrados.
