# Aprobación económica — migración 150

El caso comunicado es PAR-2026-000010: 6 horas normales y 1,5 de desplazamiento a 35 €/h de coste y 55 €/h de venta. Coste 262,50 €, venta 412,50 € y margen resultante 150,00 €.

La migración 146 sustituyó la función corregida por 102 y reintrodujo variables locales `kind`, `source` y `d` que coinciden con columnas/alias SQL. En particular, `GROUP BY kind,entry_id` entra en conflicto con la variable PL/pgSQL `kind`; PostgreSQL puede devolver 42702 al aprobar. El frontend convertía ese error en un mensaje genérico que pedía revisar datos. No se ha obtenido el error original del servidor en esta sesión, pero la colisión está presente en la definición del repositorio.

La migración 150 restaura los identificadores locales `v_*` y las referencias SQL cualificadas de 102. Conserva las restricciones de destino, responsable y estado para Comercial añadidas en 146, así como el filtro de parte en la actualización de costes, los permisos por empresa, el bloqueo de facturas/borradores, la integridad del origen y la auditoría. No contiene actualizaciones de datos al instalarse: reemplaza la función para futuras aprobaciones.

Aplicar `supabase/migrations/150_restore_economic_review_identifier_safety.sql` en el mismo proyecto Supabase que usa la web. La corrección principal funciona con el frontend ya publicado. Los cambios adicionales del frontend mejoran los mensajes de error: diferencian un fallo interno de un error en los datos y conservan las validaciones económicas útiles.

Validación local: análisis PostgreSQL y PL/pgSQL, prueba de la última definición efectiva para impedir que otra migración vuelva a introducir la colisión, comprobaciones de permisos y ámbitos, y cálculo del caso comunicado. La aprobación remota queda pendiente de comprobar después de aplicar 150.
