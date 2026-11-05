# Auditoría de navegación de la demo, 4 y 5 de noviembre de 2026

Recorrí los 73 destinos de los menús de los cinco perfiles de la demo. El total cuenta por separado cada visita a una pantalla compartida entre perfiles.

| Perfil | Destinos abiertos |
| --- | ---: |
| SAT | 21 |
| Oficina | 13 |
| Comercial | 13 |
| Gerencia | 23 |
| Técnico | 3 |

Mantenimientos de SAT terminó la carga y mostró el estado vacío y el botón de nuevo contrato. En Comercial creé un cliente ficticio y su centro. En Gerencia creé un equipo en ese centro y abrí su ficha.

En Técnico abrí los tres checks de ejemplo y sus nueve bloques. Las tres fotos de referencia cargaron. Completé los tres bloques de la seccional y, al finalizar el check, la app envió los cambios y actualizó el parte a 1 de 3. Registré 90 minutos y una unidad de material del almacén de prueba. Al enviarlos desde Cierre, el resultado fue dos registros sincronizados, cero fallidos y cero pendientes.

## Correcciones

- La verificación de entrada a la demo muestra cuándo caduca o falla y permite reintentar.
- Las tarjetas de registros anuncian el nombre principal como nombre del enlace y la información secundaria como descripción.
- La ficha y el listado de equipos ofrecen las acciones de alta y edición según los permisos que aplica la base. En Comercial, el formulario de alta llegaba a abrirse aunque el guardado se rechazaba.

## Alcance

La revisión en navegador se hizo en la demo con datos ficticios. Superadmin se cubrió con pruebas de navegación y permisos. La comprobación de menús se complementó con las operaciones indicadas arriba, y quedan fuera de esta ronda los demás guardados, el cierre completo del parte y una sesión autenticada de Pro.
