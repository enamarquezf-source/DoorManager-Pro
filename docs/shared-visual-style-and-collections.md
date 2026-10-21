# Estilo compartido y control de cobros

## Componentes y criterios

- `SectionHeader`: cabecera de sección verde suave, título, descripción y acción
  principal. Usado en los listados compartidos, Ventas, Tarifas, Compras,
  Planificación, Personal, Administración, Documentación, PRL, Vehículos y Tesorería.
- `PageHeader` y las cabeceras antiguas `.page-head` comparten el mismo tratamiento
  en `operations-theme.css`, incluidas las fichas de detalle.
- `.stats-grid .metric` y los indicadores de inicio comparten superficies blancas,
  bordes suaves y una primera tarjeta destacada. El texto de la tarjeta oscura
  tiene color explícito, no depende de heredar el color del contenedor.
- `CompactFilters`: archivo, fechas y filtros adicionales se abren bajo demanda.
  El contador muestra filtros activos. Cerrar el panel conserva los criterios.
- `OptionsMenu`: operaciones secundarias bajo demanda. En Tesorería contiene las
  cuentas nuevas, transferencias y regularización histórica. Las comprobaciones de
  permisos y los formularios originales se conservan.
- La base de botones incluye módulos antiguos sin clases específicas. Las
  variantes primarias, iconos, navegación y acciones de peligro conservan sus
  selectores específicos.
- Los `legend` se sitúan dentro de sus paneles para evitar bordes cruzando texto.

## Cobros

Cobros muestra facturas emitidas con saldo pendiente, separando vencidas, hoy,
próximos siete días, posteriores y sin vencimiento. Los importes incluyen IVA y
descuentan cobros parciales. No se cuentan borradores ni facturas canceladas.

El calendario es opcional: abrirlo no guarda nada. Pulsar un día filtra las
facturas. Registrar cobro abre el circuito existente con cuenta destino, importe,
fecha y método, sin ejecutar cargos bancarios.

La cabecera global muestra un indicador compacto para usuarios con `billing.read`
cuando hay vencimientos de hoy o atrasados. La consulta se actualiza cada minuto
con la aplicación abierta y al recuperar foco. Los cambios de facturación actualizan
también su caché, cuyo identificador incluye empresa y perfil. No se crean tareas
programadas, notificaciones externas ni recordatorios con la aplicación cerrada.

El listado de facturas carga páginas de 500 para no omitir atrasos antiguos por el
límite de respuesta. Se filtra por la empresa del perfil autenticado.

Las cuotas periódicas de mantenimiento aún no generan facturas. La interfaz lo
señala y no suma esas condiciones contractuales como dinero pendiente de cobro.

## Verificación

Pruebas de cálculo de saldos, vencimientos, cambio horario y calendario; interacción
de filtros y registro explícito; carga de todas las páginas y ámbito de empresa.
Las pruebas del DOM no sustituyen una inspección visual en navegador.
