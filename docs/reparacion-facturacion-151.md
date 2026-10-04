# Reparación de facturación

El editor ahora muestra venta aprobada sin IVA, base actual y diferencia. Compara las líneas editadas, en lugar del estado antiguo del borrador, y comprueba de nuevo el resultado después de guardarlo. Una diferencia intencionada necesita un motivo de excepción independiente de las notas generales.

Inicio y Facturación conservan los partes recibidos aunque todavía no sean preparables. Muestran las condiciones pendientes (venta, revisión económica, facturabilidad, validación histórica o envío departamental), desactivan la preparación cuando corresponde y permiten abrir el parte concreto.

## Migración 151

Ejecutar completo `supabase/migrations/151_preserve_invoice_hour_precision.sql` en el SQL Editor de Supabase. Commit y push solo actualizan la aplicación; no ejecutan esta migración.

Se amplía la precisión de la cantidad de las líneas de factura y se preparan las horas con nueve decimales. Antes, 400 minutos a 110 €/h generaban una base aprobada de 733,33 €, pero la cantidad guardada era 6,667 h. Al editar se recalculaba como 733,37 €. Con 6,666666667 h se conserva la base de 733,33 €.

La migración no recalcula facturas existentes, importes aprobados ni documentos emitidos. Los borradores ya guardados con horas redondeadas necesitan revisión: comparar los importes y corregir la cantidad con los minutos originales. Si se prefiere volver a preparar desde el parte, revisar primero las ediciones manuales y las notas del borrador; eliminarlo y volver a prepararlo descarta esas ediciones. Una diferencia comercial real requiere corregir las líneas o justificar expresamente una excepción.

El mensaje de PAR-2026-000013 confirma una diferencia económica, pero no confirma por sí solo que sea exclusivamente un redondeo. Los cuatro partes de Inicio requieren consultar sus motivos individuales tras desplegar la aplicación.
