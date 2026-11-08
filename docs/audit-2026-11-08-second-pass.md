# Segunda pasada funcional y de rendimiento — 8 de noviembre de 2026

## Comprobado en la demo pública

Desde Oficina se preparó y emitió la factura ficticia FAC-2026-000001: base 145 €, IVA 30,45 €, total 175,45 €. Se registró el cobro en Caja de simulación y se comprobó el estado Cobrada, cobrado 175,45 € y pendiente 0 €. Se finalizó la sesión temporal. No se efectuó ningún cargo bancario ni se modificaron datos de Pro.

## Fallos corregidos

- Los enlaces Ver todos de los paneles tienen destinos explícitos. Ya no abren el primer registro ni regresan a Inicio cuando la lista está vacía. Sin destino definido no se muestra un enlace engañoso.
- El inicio de Oficina deja de descargar un catálogo completo de materiales que no utiliza y las relaciones de documentos que tampoco muestra: seis consultas en lugar de siete, con una proyección documental más pequeña.
- Abrir una factura desde un enlace a su cobro reutiliza los pagos ya cargados y evita descargar nuevamente el libro completo de facturas.
- La guía acompaña la navegación deliberada por el menú hacia una misión posterior del mismo perfil. Cambia la instrucción sin acreditar las tareas omitidas.
- Las misiones de lectura de la guía dejan de consultar el progreso cada dos segundos. Conservan la consulta inicial y la actualización al recuperar el foco o cambiar la cola de sincronización.

## Rendimiento observado

Tres peticiones HTTP comprimidas a la portada pública respondieron con HTTP 200 entre 106 y 165 ms. Una recarga del listado de Facturación, esperando a que terminase su estado de carga, tardó aproximadamente 428 ms. Son observaciones puntuales con pocos datos ficticios; no son métricas de interacción inicial ni una prueba de carga.

La compilación mantiene un paquete principal de unos 906 kB, 228 kB comprimidos. La advertencia de tamaño sigue pendiente: conviene separar módulos mediante carga diferida y medir el efecto en dispositivos reales.

## Validación y límites

42 pruebas dirigidas correctas en cinco archivos, incluidos renderizado de enlaces, seguimiento de la guía, ausencia de sondeo durante lectura, consultas de Oficina y regresiones de facturación. Compilación TypeScript y Vite correcta. No requiere migración SQL.

No se ha iniciado sesión en Pro real. El recorrido de navegador demuestra este circuito de Oficina en demo, no todas las operaciones de todos los perfiles. Quedan por medir empresas con muchos registros, móvil con red limitada y recorridos completos sin cobertura.

## Siguiente mejora recomendada

Priorizar mediciones con volúmenes grandes y paginación/agregados del servidor para los paneles; después dividir el paquete principal. Mantener un recorrido repetible de aceptación que una SAT, Técnico, revisión económica, factura y cobro, incluidas las variantes sin equipo y sin conexión.
