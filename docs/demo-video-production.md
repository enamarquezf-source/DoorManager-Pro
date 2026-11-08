# Presentaciones de la demo · 8 de noviembre de 2026

Las siete entradas reproducen una edición nueva. Se utilizan capturas reales de
la demo con datos ficticios; es un montaje explicativo de pantallas, no una
grabación continua ni la prueba de un único expediente completado de principio a fin.
No incluye locución ni música. Las instrucciones se leen también sin sonido.

| Entrada | Duración | Archivo |
| --- | --- | --- |
| Descubrir DMP | 56 s | descubrir-studio-20261108.mp4 |
| Crear mi propio recorrido | 86 s | recorrido-studio-20261108.mp4 |
| SAT | 32 s | sat-studio-20261108.mp4 |
| Técnico | 41 s | tecnico-studio-20261108.mp4 |
| Oficina | 29 s | oficina-studio-20261108.mp4 |
| Comercial | 31 s | comercial-studio-20261108.mp4 |
| Gerencia | 28 s | gerencia-studio-20261108.mp4 |

La interfaz se conserva a su resolución nativa, sin zoom, desplazamiento global ni
animación de las letras. Solo se anima el cursor, cuyo destino procede del control
visible registrado junto a la captura. No se simulan pulsaciones ni resultados de
operaciones que no se realizaron. Los rótulos editoriales ocupan bandas separadas
de la aplicación. Los casos de Oficina y Gerencia son ejemplos preparados.

Los archivos tienen nombres nuevos para evitar reutilizar una película antigua.
Los alias anteriores también reciben la edición nueva para las versiones antiguas
de la aplicación. Los vídeos siguen excluidos de la descarga offline. El MP4 lleva
`moov` al principio para empezar sin descargar el archivo completo. Los siete
archivos canónicos suman aproximadamente 4,4 MB.

## Regenerar

Las capturas y coordenadas están en `scripts/demo/source-frames`. Las herramientas
multimedia se instalan dentro de `dist`, sin cambiar las dependencias de la app:

```powershell
npm install --prefix dist/video-tools --no-save --package-lock=false ffmpeg-static ffprobe-static @napi-rs/canvas
node scripts/demo/render-studio-videos.mjs
```

También se puede pasar un identificador (`tecnico`, `descubrir`, etc.) para regenerar
solo una pieza. El render verifica dimensiones, duración y disposición de streaming.
`scripts/demo/studio-manifest.json` conserva los datos de la edición completa.
La compilación de Vite limpia `dist`: realizar la producción antes de compilar.

## Validación

Revisión visual de capturas y composición; comprobación de los siete MP4 con
FFprobe (1440 × 1080, H.264, 30 fps), portadas y capítulos. Las pruebas de entrada
comprueban que cada modalidad abre su película correspondiente y no cambia a otra
al terminar. La revisión pública del reproductor debe realizarse después del
despliegue de Pages; una compilación correcta por sí sola no demuestra publicación.
