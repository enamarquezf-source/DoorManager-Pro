# Auditoría de los dos modos de demo

Revisión en curso: visita rápida y recorrido propio. El usuario ha pedido sustituir el avance manual por acompañamiento automático.

## Cambios preparados

- Avance tras nuevos registros guardados; no cuenta los datos precargados ni una recarga de página como trabajo completado.
- Sigue aperturas de parte/check y navegación explícita a secciones posteriores. Cambiar de perfil sigue siendo una acción identificable, no una mutación financiera automática.
- Mantiene abierta la pantalla actual al cambiar la instrucción. No cierra ni envía formularios por el visitante.
- Guía compacta por defecto, pausa y reducción al abrir formularios, marcas contextuales.
- 009_demo_inventory_examples.sql: proveedor y tres materiales, precios y existencias iniciales ficticias con movimientos canónicos; conserva modificaciones y consumos al reinstalar. Instalación remota pendiente de confirmación del propietario.

## Verificación automatizada

339 archivos y 1.889 pruebas pasan. Compilación correcta. Incluye prueba SQL real en PGlite de idempotencia, conservación del stock y rechazo de empresas no temporales; no sustituye la verificación en el Supabase remoto.

## Verificación pública

Pendiente de completar y registrar los resultados del recorrido después de publicar esta revisión. No afirmar que todas las opciones de la aplicación funcionan a la perfección a partir de las pruebas automatizadas.
