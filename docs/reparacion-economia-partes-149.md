# Comprobación económica de partes — 4 de octubre de 2026

En el navegador, PAR-NOVA-001 muestra 15 horas (Diego Martin: 5 normales + 3 de desplazamiento; Francisco Ena: 7 normales), todas con coste y venta guardados a cero. Un recurso aporta 250 € de coste y 0 € de venta. No hay materiales. La revisión económica está pendiente: la venta aprobada y el margen no deben mostrarse como si ya fueran definitivos.

El navegador confirma los importes visibles, pero no acredita las referencias tarifarias de esos registros. `supabase/diagnostics/diagnose_zero_time_rates_149.sql` permite comprobarlas sin modificar datos. La antigua migración 042 permitía guardar ceros cuando faltaba tarifa; la 065 exige una versión aplicable para nuevas horas. Esa diferencia es una posible explicación para registros antiguos, pendiente de confirmar en la base de datos.

Cambios:

- Columnas del resumen independientes de la rejilla de indicadores. Campos legibles en una o dos columnas según el espacio disponible.
- Líneas económicas adaptables al ancho disponible, controles de precio con el mismo estilo del formulario y barra de aprobación en el flujo normal, sin cubrir registros.
- Venta propuesta «Por decidir», venta aprobada y margen «Pendiente» mientras no existe una revisión completa. Un cero aprobado se conserva como cero real.
- Advertencia cuando las horas tienen importes cero sin versión tarifaria, diferenciada de una tarifa vinculada que realmente vale cero. El coste mostrado se identifica como parcial cuando corresponde.
- Recuperación explícita con vista previa para SAT/Gerencia/superadmin mediante `dmp_repair_legacy_time_rates`. Solo admite horas manuales positivas con todos sus importes a cero y sin versión tarifaria. Resuelve el técnico y la fecha trabajada con el catálogo canónico; no sustituye snapshots existentes, no usa tarifas actuales por defecto y no modifica horas, fechas, técnicos ni decisiones de facturabilidad.
- Si no existe una tarifa histórica única y válida, no aplica ninguna línea. Bloquea partes aprobados, cerrados o asociados a factura/borrador; valida la empresa, bloquea registros durante la operación y compara la propuesta antes de escribir. Registra la recuperación en auditoría y actualiza el coste del parte.

Para habilitar la recuperación hay que aplicar `supabase/migrations/149_repair_legacy_time_rate_snapshots.sql` y publicar el frontend. Instalar esta migración no modifica ningún importe. Después, la ficha permite «Comprobar tarifas históricas» y muestra los importes antes de «Aplicar tarifas comprobadas».

La migración se valida con el parser PostgreSQL y PL/pgSQL, pero no se ha ejecutado contra la base de datos remota. La verificación visual se realizó en el navegador con una página local temporal que utiliza el componente real y datos de prueba basados en los valores visibles, sin sesión ni escrituras remotas. Se comprobó el panel a 1280, 993 y 480 píxeles, sin desbordamientos horizontales ni controles superpuestos.
