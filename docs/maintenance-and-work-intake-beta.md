# Mantenimientos y partes: BETA

Aplicar, en orden, las migraciones 178, 179 y 180. Ejecutar después
`supabase/verification/verify_work_intake_maintenance_178_179.sql` para comprobar
tablas, funciones y protección de acceso. La 180 amplía la numeración existente
para permitir contratos MNT. No repetir migraciones anteriores de costes o nóminas.

## Recorrido

- En Mantenimientos, crear un contrato para un cliente y centro.
- Incluir equipos existentes, crear nuevos o continuar sin identificar equipos.
  Los datos técnicos desconocidos se completan más adelante; la fecha de
  instalación no se inventa. Los equipos se crean al guardar.
- Configurar vigencia, frecuencia, primera visita o fechas concretas y revisar
  el calendario. La frecuencia de facturación se configura por separado.
- Guardar en borrador o activo. Activar antes de generar los partes de visita.
- Generar una visita o el plan pendiente. Reintentar la misma operación no debe
  duplicar contratos, equipos ni partes.
- Cambiar la cobertura de equipos afecta a los partes futuros. Los partes ya
  generados conservan su historial.
- En Partes, filtrar Todos / Mantenimiento / Obra nueva / Reparaciones / Mejoras.
  Cualquier tipo admite equipos existentes, nuevos o sin identificar. El técnico
  asignado puede identificar equipos posteriormente desde el parte abierto.

Las tarjetas de contratos destacan la empresa cliente y el centro. Los formularios
compartidos usan navegación por pasos, validación y revisión final. Los campos y
archivos se mantienen montados al cambiar de paso. Las acciones de confirmación
que tienen varios botones conservan su comportamiento original.

## Alcance económico actual

Guardar un contrato o generar visitas no emite facturas, registra cobros ni envía
órdenes al banco. La periodicidad y el importe son condiciones del contrato.
Tampoco se renuevan contratos automáticamente. La renovación marcada para revisar
es información del contrato, no un proceso programado.

## Verificación

Las pruebas de `maintenanceFlow178179.test.ts` ejecutan las migraciones sobre
PostgreSQL local con PGlite, incluido el generador real de códigos. Comprueban
aislamiento, permisos, reintentos, fechas y conservación de asociaciones. El
contexto de autenticación y algunos auxiliares del esquema se sustituyen por
fixtures; no reemplaza una prueba de integración sobre Supabase.

Las pruebas de formularios verifican navegación, validación, conservación de
controles, resumen y contraste de botones fuera del contenedor principal. La
compilación no equivale a una verificación visual en el navegador.
