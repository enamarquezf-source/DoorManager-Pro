// Production-only tooling, separate from the application build.
// Install with npm install --no-save --package-lock=false ffmpeg-static @napi-rs/canvas.
// Run node scripts/demo/render-overview-videos.mjs, then npm ci to restore project dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import ffmpeg from 'ffmpeg-static';

const width = 1440;
const height = 1080;
const fps = 20;
const output = path.resolve('public/demo-intros');
const staging = path.resolve('dist/video-production');
fs.mkdirSync(staging, { recursive: true });
for (const [file, family] of [['segoeui.ttf', 'DMP'], ['segoeuib.ttf', 'DMP Bold']]) {
  const font = path.join('C:/Windows/Fonts', file);
  if (fs.existsSync(font)) GlobalFonts.registerFromPath(font, family);
}
const colors = { ink: '#102f35', mint: '#93e1cd', white: '#f5fbf8', muted: '#b4cbc7', gold: '#e7bb74' };
const phases = ['SAT', 'TÉCNICO', 'REVISIÓN', 'OFICINA', 'GERENCIA'];

const card = (duration, title, lines, label = 'DOORMANAGER PRO') => ({ duration, title, lines, label, card: true });
const shot = (role, start, end, duration, phase, title, detail) => ({ role, start, end, duration, phase, title, detail });

const discover = [
  card(7, 'Un aviso. Todo conectado.', ['Descubre cómo trabajan campo, oficina y gerencia.', 'Pantallas reales de DMP · datos ficticios'], 'DESCUBRIR DMP · MENOS DE 3 MINUTOS'),
  shot('gerencia', 4, 10, 8, 4, 'Ve más allá de una lista de partes.', 'Actividad, costes y resultados en una misma herramienta.'),
  card(4, 'Empieza por el trabajo real.', ['La visita rápida abre un parte preparado.', 'Puedes explorar sin crear antes un cliente.'], '01 · ENTRA COMO TÉCNICO'),
  shot('tecnico', 4, 8, 7, 1, 'Abre el parte de tu jornada.', 'Consulta cliente, centro y equipos antes de comenzar.'),
  shot('tecnico', 12, 17, 8, 1, 'Entra en un equipo y abre una sección.', 'Cada check conserva las comprobaciones de ese equipo.'),
  shot('tecnico', 18, 25, 11, 1, 'Revisa cada componente.', 'Si está bien, marca Todo favorable. La foto de un defecto es opcional.'),
  shot('tecnico', 25, 31, 10, 1, 'Confirma los bloques y finaliza el check.', 'En la visita rápida basta completar un equipo para continuar.'),
  card(5, 'Ahora mira el otro lado.', ['Cambia a Oficina cuando la guía te lo indique.', 'Aquí verás otro caso preparado, listo para facturar.'], '02 · DEL CAMPO A LA OFICINA'),
  shot('oficina', 8, 14, 8, 3, 'Comprueba qué se va a facturar.', 'Horas, materiales e importes quedan vinculados al parte.'),
  shot('oficina', 16, 23, 10, 3, 'Del parte al borrador de factura.', 'Verifica cliente, conceptos e impuestos antes de emitir.'),
  shot('oficina', 29, 38, 12, 3, 'Prueba el registro de un cobro.', 'Introduce importe, fecha y referencia ficticios. No hay cargos reales.'),
  shot('oficina', 39, 50, 12, 3, 'Comprueba el saldo y los vencimientos.', 'DMP permite seguir lo facturado, lo cobrado y lo pendiente.'),
  card(4, 'Convierte actividad en decisiones.', ['Los ejemplos de Gerencia ya incluyen actividad.', 'Explora de dónde sale cada importe.'], '03 · ENTIENDE TU EMPRESA'),
  shot('gerencia', 7, 15, 10, 4, 'Compara venta, coste y margen.', 'Filtra por cliente y abre un trabajo para entender su resultado.'),
  shot('gerencia', 16, 20, 7, 4, 'Sigue el origen de los números.', 'Consulta la intervención y la revisión económica del parte.'),
  shot('gerencia', 24, 30, 9, 4, 'Prueba un estudio de costes.', 'Elige fechas y pulsa Analizar periodo. Los costes se acumulan en ese periodo.'),
  shot('gerencia', 40, 43, 6, 4, 'Guarda el estudio y descarga el informe.', 'Conserva un escenario para revisarlo y compartir sus conclusiones.'),
  card(6, 'Esto es solo una pequeña muestra.', ['También hay mantenimientos, equipos e historial,', 'presupuestos, materiales, proveedores y compras.'], 'MÁS POSIBILIDADES · UN MISMO DMP'),
  card(8, 'Tu siguiente paso está preparado.', ['Elige Descubrir DMP y sigue la marca de la guía.', 'Después, crea tu propio recorrido o solicita una prueba para tu empresa.'], 'PRUÉBALO A TU RITMO'),
];

const connected = [
  card(7, 'Tu cliente. Tu trabajo. Tu recorrido.', ['Crea un caso ficticio y síguelo entre perfiles.', 'Esta presentación combina grabaciones reales de casos de ejemplo.'], 'CREAR MI PROPIO RECORRIDO'),
  card(4, 'Da forma al aviso.', ['Empezarás en SAT.', 'Usa datos inventados y guarda cada formulario.'], '01 · CLIENTE, CENTRO Y TRABAJO'),
  shot('sat', 5, 14, 12, 0, 'Crea el cliente y guarda su ficha.', 'Puedes usar datos de ejemplo y modificarlos antes de guardar.'),
  shot('sat', 17, 27, 12, 0, 'Añade su centro de trabajo.', 'Selecciona tu cliente y una ubicación ficticia. Revisa los datos y guarda.'),
  shot('sat', 29, 37, 11, 0, 'Crea el parte y asigna el técnico.', 'Elige cliente, centro, tipo de trabajo, título y técnico de prueba.'),
  shot('sat', 38, 45, 10, 0, 'Decide cómo identificar los equipos.', 'Selecciona o crea un equipo para practicar checks. Sin identificar también permite seguir.'),
  shot('sat', 46, 51, 7, 0, 'Describe el aviso y guarda el parte.', 'En tu recorrido, este mismo trabajo continuará con el técnico asignado.'),
  card(4, 'Cambia de perfil. Conserva el trabajo.', ['La guía te ofrecerá entrar como Técnico.', 'Abre el parte que has preparado en SAT.'], '02 · EJECUTA LA INTERVENCIÓN'),
  shot('tecnico', 12, 18, 8, 1, 'Abre los checks de los equipos.', 'Si el parte no tiene equipo, la guía te permite continuar con el registro.'),
  shot('tecnico', 18, 25, 9, 1, 'Indica el resultado de cada componente.', 'Marca favorable si corresponde. Si hay un defecto, identifica solo el afectado.'),
  shot('tecnico', 25, 31, 9, 1, 'Confirma cada bloque y finaliza cada check.', 'Completa todos los equipos del parte antes de cerrar el trabajo.'),
  shot('tecnico', 36, 40, 6, 1, 'En Registro, explica qué has hecho.', 'Guarda el trabajo realizado. Añade los materiales y recursos utilizados si procede.'),
  shot('tecnico', 44, 54, 12, 1, 'Añade tus horas y revisa los datos.', 'Selecciona trabajador y fecha. Introduce duración o inicio y fin, y guarda.'),
  shot('tecnico', 62, 69, 10, 1, 'Guarda una firma ficticia.', 'Escribe un nombre, dibuja la firma, confirma que es de prueba y guárdala.'),
  shot('tecnico', 71, 77, 8, 1, 'Revisa el resumen y envía a revisión.', 'Finaliza el parte y espera a que la sincronización confirme el envío.'),
  card(8, 'SAT revisa también la economía.', ['Comprueba el trabajo, los checks, las horas y los materiales.', 'Aprueba la revisión económica y después envía el parte a Facturación.'], '03 · VALIDACIÓN ANTES DE FACTURAR'),
  shot('oficina', 8, 14, 8, 2, 'Decide qué conceptos son facturables.', 'La revisión económica debe quedar aprobada antes de continuar.'),
  card(4, 'Continúa en Oficina.', ['En tu recorrido facturarás el trabajo que has creado.', 'Las imágenes siguientes muestran un caso de ejemplo de facturación.'], '04 · DEL TRABAJO AL COBRO'),
  shot('oficina', 16, 26, 12, 3, 'Prepara la factura y revisa el borrador.', 'Verifica conceptos, cantidades, precios, impuestos y vencimiento. Después emite.'),
  shot('oficina', 29, 38, 11, 3, 'Registra un cobro de prueba.', 'Selecciona la cuenta de simulación, indica importe y referencia, revisa y confirma.'),
  shot('oficina', 39, 50, 11, 3, 'Comprueba cómo cambia el pendiente.', 'Consulta Cobros para seguir saldos y vencimientos.'),
  card(4, 'Comprende el resultado.', ['Cambia a Gerencia para analizar los datos.', 'La empresa temporal también incluye ejemplos preparados.'], '05 · DEL DATO A LA DECISIÓN'),
  shot('gerencia', 7, 15, 10, 4, 'Compara costes y márgenes.', 'Abre los trabajos y consulta qué horas, materiales y recursos hay detrás.'),
  shot('gerencia', 24, 30, 9, 4, 'Crea un estudio con fechas claras.', 'Analiza el periodo y comprueba qué gastos y empleados están incluidos.'),
  shot('gerencia', 40, 43, 6, 4, 'Guarda y descarga tu informe.', 'Distingue el coste acumulado del periodo y su media mensual.'),
  card(8, 'Ahora, hazlo con tu propio caso.', ['La guía avanza al detectar tus acciones guardadas.', 'Usa datos ficticios y descubre cómo DMP puede encajar en tu empresa.'], 'TU DEMO ESTÁ LISTA'),
];

function text(ctx, value, x, y, size, color = colors.white, bold = false) {
  ctx.font = `${size}px "${bold ? 'DMP Bold' : 'DMP'}", sans-serif`;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

function imageFor(scene, index, total, filename) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#183f45');
  gradient.addColorStop(1, '#071e26');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#ffffff08';
  for (let x = 0; x < width; x += 60) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
  for (let y = 0; y < height; y += 60) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }
  ctx.fillStyle = colors.mint;
  ctx.beginPath(); ctx.roundRect(34, 19, 38, 38, 10); ctx.fill();
  text(ctx, 'D', 44, 47, 27, colors.ink, true);
  text(ctx, 'DOORMANAGER PRO', 87, 45, 21, colors.white, true);
  if (scene.card) {
    text(ctx, scene.label, 82, 284, 23, colors.mint, true);
    text(ctx, scene.title, 78, 415, 59, colors.white, true);
    ctx.fillStyle = colors.gold;
    ctx.fillRect(82, 455, 124, 5);
    scene.lines.forEach((line, i) => text(ctx, line, 82, 540 + i * 58, 30, colors.muted));
    text(ctx, 'Una pequeña muestra de todo lo que puedes hacer con DMP.', 82, 904, 23, colors.muted);
  } else {
    phases.forEach((phase, i) => {
      const x = 410 + i * 190;
      const current = i === scene.phase;
      ctx.fillStyle = current ? colors.mint : '#ffffff0c';
      ctx.beginPath(); ctx.roundRect(x, 20, 174, 36, 18); ctx.fill();
      text(ctx, phase, x + 20, 44, 16, current ? colors.ink : colors.muted, current);
    });
    text(ctx, scene.title, 34, 986, 33, colors.white, true);
    text(ctx, scene.detail, 34, 1030, 21, colors.muted);
  }
  text(ctx, String(index + 1).padStart(2, '0') + ' / ' + total, 1285, 1064, 16, colors.mint);
  fs.writeFileSync(filename, canvas.toBuffer('image/png'));
}

function run(args) {
  const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'Video rendering failed');
}

function soundtrack(seconds, filename) {
  const rate = 44100;
  const samples = Math.ceil(seconds * rate);
  const pcm = Buffer.alloc(samples * 2);
  const chords = [[130.81, 196, 261.63], [110, 164.81, 220], [146.83, 220, 293.66], [98, 146.83, 196]];
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const chord = chords[Math.floor(t / 8) % chords.length];
    const fade = Math.min(1, t / 2, (seconds - t) / 3);
    const beat = t % (60 / 92);
    const pulse = Math.sin(2 * Math.PI * 58 * t) * Math.exp(-beat * 22) * 0.012;
    const pad = chord.reduce((sum, frequency) => sum + Math.sin(2 * Math.PI * frequency * t), 0) / 3 * 0.009;
    pcm.writeInt16LE(Math.round((pad + pulse) * Math.max(0, fade) * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(pcm.length + 36, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(filename, Buffer.concat([header, pcm]));
}

function render(name, scenes) {
  const segments = [];
  const duration = scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const timestamp = seconds => {
    const hours = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor(seconds / 60) % 60).padStart(2, '0');
    return hours + ':' + minutes + ':' + String(seconds % 60).padStart(2, '0') + '.000';
  };
  let elapsed = 0;
  const chapters = scenes.map(scene => {
    const start = elapsed;
    elapsed += scene.duration;
    return timestamp(start) + ' --> ' + timestamp(elapsed) + '\n' + scene.title + '\n';
  });
  fs.writeFileSync(path.join(output, name + '.vtt'), 'WEBVTT\n\n' + chapters.join('\n'));
  if (process.argv.includes('--metadata-only')) return;
  for (const [index, scene] of scenes.entries()) {
    const stem = path.join(staging, name + '-' + index);
    imageFor(scene, index, scenes.length, stem + '.png');
    const ending = Math.max(0, scene.duration - 0.3);
    const frame = scene.card
      ? `[0:v]zoompan=z='min(1.025,1+on*0.00012)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=${width}x${height}:fps=${fps},setsar=1,format=yuv420p[composed]`
      : `[1:v]trim=duration=${scene.end - scene.start},setpts=${scene.duration / (scene.end - scene.start)}*(PTS-STARTPTS),crop=1440:900:0:0,scale=1376:860,setsar=1[screen];[0:v][screen]overlay=32:80:eof_action=repeat[composed]`;
    const filter = frame + `;[composed]drawbox=x=34:y=1050:w=1190:h=3:color=white@0.12:t=fill,drawbox=x=34:y=1050:w='${1190 * (index + 1) / scenes.length}':h=3:color=0x93e1cd:t=fill,fade=t=in:d=0.25,fade=t=out:st=${ending}:d=0.3,format=yuv420p[v]`;
    const inputs = ['-loop', '1', '-framerate', String(fps), '-i', stem + '.png'];
    if (!scene.card) inputs.push('-ss', String(scene.start), '-i', path.join(output, scene.role + '-pantalla-completa.mp4'));
    run([...inputs, '-filter_complex', filter, '-map', '[v]', '-t', String(scene.duration), '-r', String(fps), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-threads', '2', stem + '.mp4']);
    segments.push(stem + '.mp4');
    console.log(name + ' · ' + (index + 1) + '/' + scenes.length + ' · ' + scene.title);
  }
  const list = path.join(staging, name + '.txt');
  fs.writeFileSync(list, segments.map(file => "file '" + file.replaceAll('\\', '/') + "'").join('\n'));
  const audio = path.join(staging, name + '.wav');
  soundtrack(duration, audio);
  run(['-f', 'concat', '-safe', '0', '-i', list, '-i', audio, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '80k', '-movflags', '+faststart', '-shortest', path.join(output, name + '.mp4')]);
  run(['-ss', '3', '-i', path.join(output, name + '.mp4'), '-frames:v', '1', '-update', '1', path.join(output, name + '.jpg')]);
  console.log(JSON.stringify({ name, duration, bytes: fs.statSync(path.join(output, name + '.mp4')).size }));
}

render('descubrir-dmp-20261107', discover);
render('crear-recorrido-dmp-20261107', connected);
fs.copyFileSync(path.join(output, 'descubrir-dmp-20261107.mp4'), path.join(output, 'descubrir.mp4'));
fs.copyFileSync(path.join(output, 'crear-recorrido-dmp-20261107.mp4'), path.join(output, 'recorrido.mp4'));
