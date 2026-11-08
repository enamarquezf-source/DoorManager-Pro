# Presentaciones narradas de la demo

Los siete vídeos utilizan la voz sintética **F2**, elegida por el usuario, generada
localmente con Supertonic-3. No utilizan la API de OpenAI ni servicios de pago.
El modelo y sus herramientas se guardan en .demo-tools, excluido de Git y del sitio
publicado. No se modifican ajustes de Windows ni bases de datos.

| Entrada | Duración aproximada | Archivo |
| --- | --- | --- |
| Descubrir DMP | 1 min 2 s | descubrir-f2-20261108.mp4 |
| Crear mi propio recorrido | 1 min 35 s | recorrido-f2-20261108.mp4 |
| SAT | 39 s | sat-f2-20261108.mp4 |
| Técnico | 49 s | tecnico-f2-20261108.mp4 |
| Oficina | 32 s | oficina-f2-20261108.mp4 |
| Comercial | 38 s | comercial-f2-20261108.mp4 |
| Gerencia | 33 s | gerencia-f2-20261108.mp4 |

## Edición y ritmo

Son montajes explicativos de capturas reales con datos ficticios, no grabaciones
continuas ni prueba de un único expediente completado de principio a fin. Los
casos preparados de Oficina y Gerencia se identifican como ejemplos.

La imagen y las letras se mantienen fijas a resolución nativa. Solo se anima el
cursor hacia un control registrado en la captura. Los rótulos ocupan bandas
separadas de la app. La narración usa frases completas y breves, a velocidad de
síntesis 0,94. No se acelera ni se estira el audio después de generarlo: si una
frase necesita más tiempo, la escena espera. Hay 0,2 s antes de cada frase y un
mínimo de 0,4 s al terminar. Una única pista maestra por película evita acumular
retardo de codificación entre escenas. Se normaliza a -18 LUFS con techo de pico
real -1,5 dB, sin modificar velocidad ni tono.

El reproductor empieza silenciado y permite activar la voz con el botón
«Escuchar narración». Incluye subtítulos completos en español, capítulos y el
aviso «Narración con voz de IA». La duración mostrada procede del render real.

Los nombres nuevos evitan reutilizar archivos antiguos. Los alias previos también
reciben la edición narrada. Los vídeos siguen fuera de la descarga offline y
llevan el índice MP4 al principio para facilitar el inicio de reproducción.

## Producción reproducible

1. Preparar Python 3.12 y las dependencias locales:
   pip install --no-cache-dir --only-binary=:all: --target .demo-tools/local-voice/supertonic/python supertonic==1.3.1
2. Ejecutar scripts/demo/generate-youthful-voice-samples.py para descargar los
   activos oficiales fijados a la revisión probada por el SDK. Solo descarga al
   proyecto. Verifica los hashes publicados para los archivos grandes.
3. Ejecutar scripts/demo/generate-f2-narration.py. Los textos están en
   scripts/demo/studio-scenes.json. Conserva los WAV por firma del texto y los
   parámetros para reutilizarlos, y produce una pista continua por película.
4. Instalar las herramientas de vídeo en .demo-tools/video-tools con npm:
   ffmpeg-static, ffprobe-static y @napi-rs/canvas, sin cambiar dependencias de la app.
5. Ejecutar node scripts/demo/render-studio-videos.mjs. Produce películas,
   portadas, capítulos, subtítulos, manifiesto y src/demo/introVideos.ts.
6. Ejecutar las pruebas de entrada/reproductor y npm run build.

El runtime Supertonic tiene licencia MIT y el modelo OpenRAIL-M. La licencia del
modelo se conserva en docs/licenses/supertonic-3-OpenRAIL-M.txt. Se informa del
origen sintético de la voz en el vídeo y en el reproductor.

Fuentes del proveedor:
https://huggingface.co/Supertone/supertonic-3
https://github.com/supertone-oss-archive/supertonic-py

## Validación

El render comprueba dimensiones (1440 × 1080), duración, pista AAC e índice de
streaming. Se comprueba decodificación de audio, volumen, desfase entre audio y
vídeo y que ninguna frase sobrepase su escena. Las pruebas del reproductor cubren
la activación y desactivación de voz con un clic y la disponibilidad de subtítulos.
La naturalidad y la preferencia de acento son subjetivas: el usuario seleccionó F2
entre las muestras; las comprobaciones técnicas no sustituyen la escucha humana.
