# Revisión de la demo · 26/10/2026

Se ha usado la demo pública mediante navegador, con una empresa temporal y datos
ficticios. No se ha accedido a la base de la instalación principal.

## Comprobaciones realizadas en la web pública

| Recorrido | Resultado observado |
| --- | --- |
| Entrada como Oficina | Crea sesión; cambio a SAT y Técnico conserva la empresa. |
| Actualizar DMP | El aviso de versión lleva al actualizador; conserva la sesión y carga la versión nueva. |
| Oficina: crear concepto de tarifa | Concepto por km guardado y listado. |
| Oficina: añadir versión vigente | Coste 0,30 €/km y venta 0,60 €/km guardados. |
| Técnico: preparar jornada | Parte y tres checks descargados antes de entrar. |
| Técnico: registrar 25 km | Registro local visible; envío devuelve 1 sincronizado, 0 fallidos y 0 pendientes. |
| Técnico: consultar después del envío | **Fallo reproducido:** el registro desaparecía de Desplazamientos por filtrar solo el código literal antiguo. |
| SAT: crear cliente | Cliente guardado, numerado CLI-000001 y visible sin recargar. |
| SAT: crear presupuesto | Borrador guardado y detalle abierto. |
| SAT: añadir tarifa al presupuesto | Dos horas a 45 €/h: coste 44 €, venta 90 €, IVA 18,90 €, total 108,90 €, margen 46 €. |
| Gerencia: inicio | Carga empresa con actividad, costes y aviso de factura vencida. Se detectó solapamiento entre realizados y pendientes. |
| Desplazamiento tras desplegar la corrección | Reabierto el mismo parte en la web pública actualizada: muestra 1 desplazamiento, 25 km, con Editar/Eliminar. |
| Oficina: crear proveedor sin banco ni código | Guardado y visible sin recargar; formulario cerrado sin error. |
| Oficina: alta de Mano de obra tras corregir | Concepto guardado, abre precio/vigencia; versión coste 25 €/h y venta 55 €/h guardada y visible. |

## Correcciones

- Desplazamientos reconoce códigos personalizados con unidad km y registros
  identificados como desplazamiento. Otros recursos tienen un apartado propio:
  no desaparecen del registro técnico después de sincronizar.
- La clasificación Mano de obra genera también `kind=labor`; antes el formulario
  podía enviar `kind=cost` y `classification=labor`.
- Después de crear un concepto se abre su precio/vigencia. Un concepto sin versión
  vigente se señala como incompleto, en lugar de parecer listo para usar.
- `supabase/demo/008_demo_resource_rates.sql` prepara kilometraje, salida de zona
  y plataforma con versiones ficticias. No registra consumos ni gastos por sí solo.
  Requiere instalación manual en el Supabase de demo; no hay credenciales de
  administración disponibles en esta sesión. Preserva precios modificados por
  visitantes y no duplica las versiones al reinstalar.
- Gerencia: los finalizados técnicamente y facturados dejan de contarse también
  como pendientes en la comparación de trabajos.

## Límites de la revisión

El conjunto de pruebas automatizadas pasa (332 archivos / 1.870 pruebas), pero no
equivale a probar todas las operaciones en la web pública. Siguen pendientes de
aceptación remota completa: fotos y firma en Storage, compras con recepción desde
la interfaz, cierre técnico completo, revisión SAT, facturación/cobro y recorrido
económico de Gerencia. Se han verificado públicamente después del despliegue el
desplazamiento persistido y el nuevo flujo de tarifas. No afirmar que toda la
aplicación está libre de errores.
