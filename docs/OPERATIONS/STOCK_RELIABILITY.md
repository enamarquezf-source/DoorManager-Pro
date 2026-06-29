# DoorManager Pro - Stock Reliability

| Campo | Valor |
| --- | --- |
| Version | 0.1 |
| Estado | Conceptual |
| Fecha | 2026-06-29 |
| Autor | Francisco Javier Ena Marquez |
| Ultima modificacion | 2026-06-29 |

## 1. Proposito

Definir stock distribuido, fiabilidad, reservas, recuentos y necesidades de reposicion.

## 2. Stock distribuido

DMP debe distinguir almacen central, almacenes secundarios, furgonetas, ubicaciones de cliente u obra, material reservado, material pendiente y material defectuoso cuando exista incidencia real.

Las furgonetas son almacenes moviles controlables. Todo traslado genera movimiento trazable.

## 3. Stock teorico y real

DMP debe diferenciar stock teorico, contado, reservado, disponible, pendiente de validar y en discrepancia.

Las diferencias no se corrigen automaticamente. Los ajustes requieren usuario, fecha, ubicacion, cantidad anterior, cantidad contada, diferencia, motivo y aprobacion si la empresa la exige.

## 4. Indice de fiabilidad

Cada almacen o furgoneta tendra un nivel de fiabilidad segun antiguedad del ultimo recuento, frecuencia de movimientos, diferencias recientes, ajustes, devoluciones pendientes y movimientos no validados.

Niveles orientativos:

- Alta.
- Media.
- Baja.
- Sin verificar.

Este indice informa, pero no bloquea operaciones.

## 5. Control individual y por cantidad

DMP debe admitir equipos y unidades individualizadas, y consumibles controlados por cantidad. La clasificacion depende de como entra el material documentalmente.

## 6. Reservas y reposicion

Una reserva no es bloqueo rigido. Usuarios autorizados pueden reasignar material reservado. Si afecta a stock negativo, parte incompleto o planificacion, DMP avisa claramente y conserva trazabilidad.

Si una reserva, consumo o ajuste deja stock negativo o por debajo del minimo, DMP genera una Necesidad de Reposicion. No crea todavia un pedido.

Estados posibles: pendiente de revision, aprobada, incluida en pedido, cubierta mediante traslado, descartada y resuelta.

## 7. Consolidacion y sobrantes

DMP debe agrupar necesidades por material y mostrar cantidad total, desglose por expediente y parte, cantidad para recuperar minimos, fechas, prioridades y ubicaciones.

Cuando sobra material comprado para un parte, puede volver a stock, ir a una furgoneta o reservarse para otra visita, conservando relacion con pedido, expediente y parte de origen. Solo se marca defectuoso si existe incidencia real.

## 8. Documentos relacionados

- `docs/OPERATIONS/SUPPLIERS_PURCHASING_AND_STOCK.md`.
- `docs/OPERATIONS/MATERIAL_REQUESTS.md`.
- `docs/03-modelo-datos.md`.
