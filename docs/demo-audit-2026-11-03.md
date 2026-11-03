# Auditoría de la demo pública · 03/11/2026

URL: https://demo-doormanager-pro.enamarquezf.workers.dev/

Solo se han usado el Worker de demo, su proyecto Supabase y datos ficticios. No se han ejecutado migraciones ni operaciones contra la base de Pro. Los cambios de esta revisión son exclusivos de la demo o están condicionados a publicDemoEnabled.

## Comprobaciones públicas realizadas

| Prueba | Resultado observado |
| --- | --- |
| Entrada sin cuenta | Elección de rol y creación de empresa temporal correctas. |
| Actualizar DMP | Conserva la sesión y el perfil; abre la ruta solicitada. No se borra la caché de trabajo pendiente. |
| Alta de material y proveedor | Guardado correcto desde Oficina; la guía avanza al guardar. |
| Pedido y recepción | Pedido de cinco unidades a 30 EUR; recepción confirmada y entrada de cinco unidades. |
| Factura desde la compra | Copia una línea, cantidad cinco, base 150 EUR, IVA 31,50 EUR y total 181,50 EUR, vinculados a pedido y recepción. |
| Registro y pago de proveedor | El formulario de pago aparece sin recargar tras registrar. Pago ficticio de 181,50 EUR desde Caja de simulación; pagado 181,50 y pendiente 0. |
| Defecto de componente | Un componente con problema leve; los demás favorables por confirmación expresa del visitante. Foto ficticia ligada al componente. |
| Finalizar check | Envía respuestas y foto automáticamente; mensaje de check finalizado y sincronizado. La visita breve pasa de la misión 2 a la 3 solo después de finalizar. |
| Trabajo realizado, horas y firma | Texto ficticio, 90 minutos y firma ficticia guardados. El registro de horas hace avanzar a Firma. Envío confirmado: tres cambios sincronizados, cero fallidos y cero pendientes. |
| Navegación de cierre | La misión de firma abre Cierre del mismo parte. Se muestra el resumen de requisitos, sin cerrar por el visitante. |

Las sesiones de demo caducan. Los identificadores de las pruebas no son referencias permanentes para presentar el producto.

## Correcciones

- La ayuda de móvil sigue la selección del componente, su descripción, confirmación de los restantes y guardado; no marca casillas por el visitante.
- La confirmación del bloque queda por encima de la franja de ayuda. La ayuda ampliada limita su altura y conserva visible el cierre.
- Elegir una misión recoge el mapa para no interceptar Guardar. Empezar a escribir recoge la ayuda.
- Elegir un perfil de negocio después de la visita rápida abre su guía, en lugar de arrastrar la del técnico.
- La misión de pago solo reacciona a la factura visible. Registrar la factura todavía no completa el paso del pago.
- Al volver a una compra desde la guía se recuerda su factura creada y se abre esa ficha, sin proponer otro borrador.
- El borrador de demo muestra los artículos y sus bases antes de crearlo; no muestra identificadores técnicos como explicación del origen.
- Se aclara el contador de fotos del parte y el mensaje de firma para que un aviso anterior no contradiga el envío ya confirmado.
- La cabecera administrativa móvil tiene fondo opaco y más espacio para títulos largos.

## Pendientes y límites

- No se ha repetido en esta sesión todo el circuito propio SAT → Técnico con todos los checks → SAT → factura al cliente. Las pruebas automáticas cubren sus transiciones, pero no sustituyen esa aceptación pública completa.
- Concurrencia remota con varios visitantes, importaciones masivas, varias pestañas con trabajo pendiente y uso sin cobertura en un teléfono físico necesitan una prueba específica.
- No se certifica ausencia de todos los errores ni aptitud para datos reales. Es una beta pública guiada para recoger comentarios.
- La confirmación visual de las últimas correcciones depende de completar su despliegue; ver el informe del chat para la versión publicada.

## Cómo presentarla

Usar el enlace y el texto de demo-presentacion.md. Para mostrar el circuito corto, elegir Descubrir DMP y terminar un check. Oficina abre otro ejemplo preparado, identificado como tal. Para un caso propio entre perfiles, elegir Crear mi propio recorrido.

## Validación automática

Suite completa: 350 archivos y 1.950 pruebas correctas. Compilación correcta. La comprobación estática del destino de factura se ha ajustado para admitir que se recuerde su origen antes de navegar; se mantienen las pruebas de creación atómica y recuperación.
