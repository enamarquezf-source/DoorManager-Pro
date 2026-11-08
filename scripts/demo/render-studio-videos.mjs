// Reproducible editorial cut from actual demo screenshots. No UI zoom or text animation.
// npm install --prefix dist/video-tools --no-save --package-lock=false ffmpeg-static ffprobe-static @napi-rs/canvas
// node scripts/demo/render-studio-videos.mjs [film-id]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(path.resolve('dist/video-tools/package.json'));
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const ffmpeg = require('ffmpeg-static');
const ffprobe = require('ffprobe-static').path;
const source = path.resolve('scripts/demo/source-frames');
const output = path.resolve('public/demo-intros');
const staging = path.resolve('dist/video-studio');
fs.mkdirSync(staging, { recursive: true });
for (const [font, name] of [['segoeui.ttf', 'DMP'], ['segoeuib.ttf', 'DMP Bold']]) {
  GlobalFonts.registerFromPath('C:/Windows/Fonts/' + font, name);
}
const W = 1440, H = 1080, FPS = 30, TOP = 64;
const C = { ink: '#122f35', mint: '#95e1cd', text: '#f5faf8', muted: '#bfd4ce', line: '#2e5156' };
const shot = (frame, seconds, title, detail) => ({ frame, seconds, title, detail });
const end = (seconds = 3) => shot(null, seconds, 'Ahora, pon DMP a prueba.', 'Elige tu perfil. La guía te acompaña dentro de la demo.');
const films = {
  descubrir: { label: 'DESCUBRE DMP', scenes: [
    shot('gerencia-inicio', 5, 'Un aviso. Un equipo. Todo conectado.', 'Descubre una pequeña muestra de lo que puede hacer DMP.'),
    shot('tecnico-jornada', 5, 'Empieza por el trabajo real.', 'Abre el parte preparado. Tu jornada también está disponible sin cobertura.'),
    shot('tecnico-equipos', 5, 'Cada equipo tiene su revisión.', 'Pulsa una tarjeta para entrar en su check.'),
    shot('tecnico-bloque', 6, 'Comprueba. Marca. Confirma.', 'Si todo está bien, elige Todo favorable. Las fotos de defectos son opcionales.'),
    shot('tecnico-favorable', 5, 'El resultado queda claro.', 'Confirma el bloque y completa las demás secciones antes de finalizar el check.'),
    shot('oficina-revision', 6, 'Del trabajo a la factura.', 'En Oficina, revisa otro caso preparado: conceptos, impuestos y total.'),
    shot('oficina-cobros', 5, 'Lo pendiente, a primera vista.', 'Consulta cobros, vencimientos e importes atrasados.'),
    shot('oficina-calendario', 5, 'Anticípate a los próximos cobros.', 'El calendario reúne las fechas que necesitas seguir.'),
    shot('gerencia-rentabilidad', 6, 'Entiende de dónde sale el margen.', 'Compara venta y coste. Detecta desviaciones antes de tomar decisiones.'),
    shot('gerencia-estudio', 5, 'Convierte actividad en decisiones.', 'Prueba un estudio de costes y explora el resultado del periodo.'),
    end(3),
  ] },
  recorrido: { label: 'CREA TU PROPIO RECORRIDO', scenes: [
    shot('sat-inicio', 4, 'Tu cliente. Tu trabajo. Tu recorrido.', 'Crea un caso ficticio y síguelo entre los perfiles de tu empresa de prueba.'),
    shot('sat-cliente', 5, 'SAT · Da de alta el cliente.', 'Usa los datos de ejemplo o escribe unos inventados. Revisa antes de guardar.'),
    shot('sat-cliente-revision', 4, 'Comprueba la ficha y guárdala.', 'La guía continúa al completar la acción.'),
    shot('sat-centro', 5, 'Añade el centro de trabajo.', 'Vincula la ubicación con el cliente que acabas de crear.'),
    shot('sat-parte', 6, 'Describe el aviso y asigna el técnico.', 'Selecciona cliente, centro, tipo de trabajo y un técnico de prueba.'),
    shot('sat-equipos', 6, 'El equipo, a tu manera.', 'Selecciona uno existente o crea uno para practicar checks. Sin identificar también permite continuar.'),
    shot('tecnico-parte', 5, 'Técnico · Abre el trabajo asignado.', 'Intervención, Checks, Registro, Fotos y Cierre: cada cosa tiene su sitio.'),
    shot('tecnico-check', 5, 'Revisa las secciones de cada equipo.', 'Estos planos muestran un equipo de ejemplo de la demo.'),
    shot('tecnico-bloque', 6, 'Registra el resultado de los componentes.', 'Marca favorable si corresponde. Confirma cada bloque y finaliza cada check.'),
    shot('tecnico-registro', 5, 'Deja constancia del trabajo.', 'En Registro, escribe lo realizado y guarda. Añade los recursos utilizados.'),
    shot('tecnico-horas', 6, 'Registra el tiempo de la visita.', 'Comprueba trabajador y fecha. Usa 90 minutos de ejemplo o indica Inicio y Fin.'),
    shot('tecnico-cierre', 6, 'Revisa, firma y envía.', 'En Cierre, añade una firma ficticia, finaliza el parte y espera la sincronización.'),
    shot(null, 6, 'SAT · Valida antes de facturar.', 'Revisa trabajo, checks y recursos. Acepta la revisión económica y envía a Facturación.'),
    shot('oficina-revision', 5, 'Oficina · Revisa la factura.', 'Comprueba los conceptos y el total antes de simular su emisión.'),
    shot('oficina-cobros', 4, 'Registra y sigue los cobros.', 'La demo utiliza datos ficticios. No realiza cargos bancarios.'),
    shot('gerencia-rentabilidad', 5, 'Gerencia · Consulta el resultado.', 'Explora los ejemplos y compara la venta con los costes registrados.'),
    end(3),
  ] },
  sat: { label: 'SAT · ORGANIZA EL TRABAJO', scenes: [
    shot('sat-inicio', 4, 'Todo empieza con un aviso.', 'Cliente, ubicación, equipo y técnico. Un trabajo bien preparado.'),
    shot('sat-cliente', 5, 'Crea el cliente de prueba.', 'Rellena la ficha, revisa los datos y guarda.'),
    shot('sat-centro', 4, 'Sitúa el trabajo en su centro.', 'Selecciona el cliente y añade una ubicación ficticia.'),
    shot('sat-parte', 6, 'Crea el parte y asigna el técnico.', 'Describe el aviso, elige el tipo de trabajo y comprueba la asignación.'),
    shot('sat-equipos', 6, 'Identifica los equipos sin bloquearte.', 'Incluye uno existente, crea uno o continúa sin identificar si todavía no lo conoces.'),
    shot(null, 4, 'Del aviso a la revisión.', 'Guarda el parte. Después podrás cambiar a Técnico y volver a SAT para validarlo.'),
    end(3),
  ] },
  tecnico: { label: 'TÉCNICO · TRABAJA CON CLARIDAD', scenes: [
    shot('tecnico-jornada', 4, 'Tu jornada, lista para empezar.', 'Abre el parte preparado y consulta el aviso.'),
    shot('tecnico-equipos', 4, 'Pulsa el equipo que vas a revisar.', 'Cada tarjeta abre su check.'),
    shot('tecnico-check', 4, 'Entra en cada sección.', 'La foto de referencia te ayuda a identificar el equipo.'),
    shot('tecnico-bloque', 6, 'Comprueba los componentes.', 'Si están bien, marca Todo favorable. Después confirma el bloque.'),
    shot('tecnico-favorable', 4, 'Completa los checks del parte.', 'Confirma cada sección y finaliza cada check para sincronizarlo.'),
    shot('tecnico-registro', 5, 'Explica el trabajo realizado.', 'Guarda el texto y registra los materiales y recursos usados.'),
    shot('tecnico-horas', 6, 'Añade las horas de la visita.', 'Comprueba trabajador y fecha. Indica duración o Inicio y Fin; revisa y guarda.'),
    shot('tecnico-cierre', 5, 'Cierra con el resumen a la vista.', 'Guarda una firma ficticia, finaliza el parte y envíalo a revisión.'),
    end(3),
  ] },
  oficina: { label: 'OFICINA · DEL PARTE AL COBRO', scenes: [
    shot('oficina-pendientes', 5, 'El trabajo está hecho. Ahora, factúralo.', 'Abre un parte preparado y revisa qué se va a facturar.'),
    shot('oficina-borrador', 5, 'Prepara el borrador.', 'Comprueba el cliente y los conceptos asociados al trabajo.'),
    shot('oficina-revision', 6, 'Verifica los importes antes de emitir.', 'Revisa bases, impuestos y total. Todo es una simulación con datos ficticios.'),
    shot('oficina-cobros', 5, 'Controla lo pendiente.', 'Explora el registro de cobros, los atrasos y los próximos vencimientos.'),
    shot('oficina-calendario', 5, 'Cada fecha, en su sitio.', 'Consulta el calendario para organizar el seguimiento.'),
    end(3),
  ] },
  comercial: { label: 'COMERCIAL · CONVIERTE UNA NECESIDAD EN TRABAJO', scenes: [
    shot('comercial-inicio', 4, 'De la oportunidad a la propuesta.', 'Clientes, presupuestos y seguimiento comercial en el mismo espacio.'),
    shot('comercial-propuesta', 5, 'Prepara el presupuesto.', 'Selecciona cliente, tipo de trabajo y una descripción clara.'),
    shot('comercial-revision', 4, 'Revisa y crea la propuesta.', 'Comprueba los datos antes de guardar.'),
    shot('comercial-linea', 6, 'Añade los conceptos.', 'Indica descripción, cantidad, coste, precio de venta e IVA.'),
    shot('comercial-importes', 5, 'Conoce los importes y el margen.', 'Distingue coste interno, total del cliente y beneficio estimado.'),
    shot('comercial-presupuesto', 4, 'Continúa con el seguimiento.', 'Marca el envío, simula la aceptación y genera el parte cuando esté aceptado.'),
    end(3),
  ] },
  gerencia: { label: 'GERENCIA · ENTIENDE TU NEGOCIO', scenes: [
    shot('gerencia-inicio', 4, 'Más información. Mejores decisiones.', 'Explora un negocio ficticio con actividad ya preparada.'),
    shot('gerencia-rentabilidad', 6, 'Compara venta, coste y margen.', 'Detecta qué trabajos necesitan atención y consulta el origen de los importes.'),
    shot('gerencia-periodo', 5, 'Elige el periodo que quieres estudiar.', 'Los costes de personal se acumulan según el intervalo seleccionado.'),
    shot('gerencia-estudio', 6, 'Analiza el resultado.', 'Revisa horas registradas, costes y actividad. Un dato útil necesita contexto.'),
    shot(null, 4, 'Guarda tus conclusiones.', 'Puedes conservar el estudio y descargar su informe visual para revisarlo después.'),
    end(3),
  ] },
};
function run(exe, args) {
  const result = spawnSync(exe, args, { encoding: 'utf8', maxBuffer: 8e6 });
  if (result.status !== 0) throw new Error(result.stderr || 'Media command failed');
  return result.stdout;
}
function text(ctx, value, x, y, size, color = C.text, bold = false) {
  ctx.font = `${size}px "${bold ? 'DMP Bold' : 'DMP'}"`;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}
function wrap(ctx, value, x, y, maxWidth, size, color, lineHeight) {
  ctx.font = `${size}px "DMP"`;
  const lines = []; let line = '';
  for (const word of value.split(' ')) {
    if (line && ctx.measureText(line + ' ' + word).width > maxWidth) { lines.push(line); line = word; }
    else line += (line ? ' ' : '') + word;
  }
  lines.push(line);
  lines.forEach((v, i) => text(ctx, v, x, y + i * lineHeight, size, color));
}
const cursor = createCanvas(42, 54), cc = cursor.getContext('2d');
cc.beginPath(); cc.moveTo(4, 4); cc.lineTo(4, 38); cc.lineTo(13, 30); cc.lineTo(21, 48); cc.lineTo(29, 44); cc.lineTo(21, 27); cc.lineTo(35, 27); cc.closePath();
cc.fillStyle = '#fff'; cc.fill(); cc.strokeStyle = C.ink; cc.lineWidth = 2.5; cc.stroke();
fs.writeFileSync(path.join(staging, 'cursor.png'), cursor.toBuffer('image/png'));
async function base(scene, film, index) {
  const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
  ctx.fillStyle = C.ink; ctx.fillRect(0, 0, W, H);
  text(ctx, 'DMP', 28, 42, 26, C.mint, true);
  text(ctx, film.label, 115, 39, 16, C.text, true);
  text(ctx, 'DEMO · DATOS FICTICIOS', 1170, 38, 13, C.muted);
  let target = null;
  if (scene.frame) {
    const img = await loadImage(path.join(source, scene.frame + '.jpg'));
    if (img.width > W || img.height > 900) throw new Error('Unexpected capture dimensions: ' + scene.frame);
    const left = Math.floor((W - img.width) / 2);
    ctx.fillStyle = '#ecf2f3'; ctx.fillRect(0, TOP, W, 900);
    ctx.drawImage(img, left, TOP); // Native pixels. Never zoom or resample the application.
    const metaPath = path.join(source, scene.frame + '.json');
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (meta.target && meta.target.x >= 0 && meta.target.x <= 1440 && meta.target.y >= 0 && meta.target.y <= 900) {
        target = { x: left + meta.target.x * img.width / 1440, y: TOP + meta.target.y * img.height / 900 };
      }
    }
    text(ctx, scene.title, 28, 1006, 29, C.text, true);
    wrap(ctx, scene.detail, 28, 1042, 1360, 19, C.muted, 25);
  } else {
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    for (let x = 32; x < W; x += 80) { ctx.beginPath(); ctx.moveTo(x, 110); ctx.lineTo(x, 890); ctx.stroke(); }
    ctx.fillStyle = C.ink; ctx.fillRect(60, 325, 1320, 380);
    text(ctx, 'UN EQUIPO · UN CIRCUITO · DMP', 80, 366, 18, C.mint, true);
    text(ctx, scene.title, 76, 465, 53, C.text, true);
    wrap(ctx, scene.detail, 80, 540, 1200, 29, C.muted, 44);
    text(ctx, 'Una pequeña muestra de todo lo que puedes hacer.', 80, 850, 23, C.muted);
  }
  ctx.fillStyle = C.line; ctx.fillRect(0, 1076, W, 4);
  ctx.fillStyle = C.mint; ctx.fillRect(0, 1076, W * (index + 1) / film.scenes.length, 4);
  return { bytes: canvas.toBuffer('image/png'), target };
}
const stamp = n => `00:${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}.000`;
const manifest = [];
for (const [id, film] of Object.entries(films)) {
  if (process.argv[2] && process.argv[2] !== id) continue;
  const name = `${id}-studio-20261108`, segments = [];
  let elapsed = 0; const chapters = [];
  for (const [i, scene] of film.scenes.entries()) {
    const stem = path.join(staging, name + '-' + i);
    const frame = await base(scene, film, i);
    fs.writeFileSync(stem + '.png', frame.bytes);
    const inputs = ['-loop', '1', '-framerate', String(FPS), '-i', stem + '.png'];
    let filter = '[0:v]format=yuv420p[v]';
    if (frame.target) {
      inputs.push('-loop', '1', '-framerate', String(FPS), '-i', path.join(staging, 'cursor.png'));
      const p = 'clip((t-0.55)/1.05,0,1)', easing = `(3*pow(${p},2)-2*pow(${p},3))`;
      const tx = Math.round(frame.target.x) - 4, ty = Math.round(frame.target.y) - 4;
      const sx = Math.max(260, tx - 140), sy = Math.max(TOP + 50, ty - 75);
      filter = `[0:v][1:v]overlay=x='${sx}+(${tx}-${sx})*${easing}':y='${sy}+(${ty}-${sy})*${easing}':eval=frame,format=yuv420p[v]`;
    }
    run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', filter, '-map', '[v]', '-t', String(scene.seconds), '-r', String(FPS), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-threads', '2', stem + '.mp4']);
    segments.push(stem + '.mp4');
    chapters.push(`${stamp(elapsed)} --> ${stamp(elapsed + scene.seconds)}\n${scene.title}\n`);
    elapsed += scene.seconds;
    console.log(`${id} ${i + 1}/${film.scenes.length}: ${scene.title}`);
  }
  const list = path.join(staging, name + '.txt');
  fs.writeFileSync(list, segments.map(f => `file '${f.replaceAll('\\', '/')}'`).join('\n'));
  const destination = path.join(output, name + '.mp4');
  run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', destination]);
  run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '0', '-i', destination, '-frames:v', '1', '-update', '1', path.join(output, name + '.jpg')]);
  fs.writeFileSync(path.join(output, name + '.vtt'), 'WEBVTT\n\n' + chapters.join('\n'));
  const probe = JSON.parse(run(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', destination]));
  if (Math.abs(Number(probe.format.duration) - elapsed) > 0.1 || probe.streams[0].width !== W || probe.streams[0].height !== H) throw new Error('Invalid rendered movie: ' + id);
  const file = fs.readFileSync(destination);
  if (file.indexOf('moov') > file.indexOf('mdat')) throw new Error('Movie not optimized for streaming');
  // Older application shells must receive the new edit too, not an obsolete film.
  const aliases = id === 'descubrir' ? ['descubrir', 'descubrir-dmp-20261107']
    : id === 'recorrido' ? ['recorrido', 'crear-recorrido-dmp-20261107']
    : [id, `${id}-pantalla-completa`, ...(id === 'tecnico' ? ['tecnico-recorrido'] : [])];
  for (const alias of aliases) {
    fs.copyFileSync(destination, path.join(output, alias + '.mp4'));
    for (const extension of ['jpg', 'vtt']) {
      const old = path.join(output, alias + '.' + extension);
      if (fs.existsSync(old)) fs.copyFileSync(path.join(output, name + '.' + extension), old);
    }
  }
  manifest.push({ id, name, seconds: elapsed, bytes: file.length, width: W, height: H, fps: FPS });
}
fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
