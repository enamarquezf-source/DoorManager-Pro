// Reproducible editorial cut from actual demo screenshots. No UI zoom or text animation.
// npm install --prefix .demo-tools/video-tools --no-save --package-lock=false ffmpeg-static ffprobe-static @napi-rs/canvas
// First run generate-f2-narration.py; then node scripts/demo/render-studio-videos.mjs [film-id]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(path.resolve('.demo-tools/video-tools/package.json'));
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
const films = JSON.parse(fs.readFileSync(path.resolve('scripts/demo/studio-scenes.json'), 'utf8'));
const narration = JSON.parse(fs.readFileSync(path.resolve('.demo-tools/narration/plan.json'), 'utf8'));

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
  text(ctx, 'VOZ IA · DATOS FICTICIOS', 1170, 38, 13, C.muted);
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
const stamp = n => {
  const ms = Math.round(n * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
};
const manifest = [];
for (const [id, film] of Object.entries(films)) {
  if (process.argv[2] && process.argv[2] !== id) continue;
  const name = `${id}-f2-20261108`, segments = [];
  let elapsed = 0; const chapters = [], subtitles = [];
  for (const [i, scene] of film.scenes.entries()) {
    const voice = narration[id]?.scenes[i];
    if (!voice || voice.text !== scene.narration || voice.tailSeconds < 0.39) throw new Error('Regenerate narration: ' + id + '/' + i);
    const seconds = voice.seconds;
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
    run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', filter, '-map', '[v]', '-t', String(seconds), '-r', String(FPS), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-threads', '2', stem + '.mp4']);
    segments.push(stem + '.mp4');
    chapters.push(`${stamp(elapsed)} --> ${stamp(elapsed + seconds)}\n${scene.title}\n`);
    subtitles.push(`${stamp(elapsed + voice.leadSeconds)} --> ${stamp(elapsed + voice.leadSeconds + voice.spokenSeconds)}\n${scene.narration.replaceAll('de eme pe', 'DMP')}\n`);
    elapsed += seconds;
    console.log(`${id} ${i + 1}/${film.scenes.length}: ${scene.title}`);
  }
  const list = path.join(staging, name + '.txt');
  fs.writeFileSync(list, segments.map(f => `file '${f.replaceAll('\\', '/')}'`).join('\n'));
  const destination = path.join(output, name + '.mp4');
  run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-i', path.resolve(narration[id].file), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', 'loudnorm=I=-18:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '96k', '-ar', '48000', '-t', String(elapsed), '-movflags', '+faststart', destination]);
  run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '0', '-i', destination, '-frames:v', '1', '-update', '1', path.join(output, name + '.jpg')]);
  fs.writeFileSync(path.join(output, name + '.vtt'), 'WEBVTT\n\n' + chapters.join('\n'));
  fs.writeFileSync(path.join(output, name + '.es.vtt'), 'WEBVTT\n\n' + subtitles.join('\n'));
  const probe = JSON.parse(run(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', destination]));
  if (Math.abs(Number(probe.format.duration) - elapsed) > 0.1 || probe.streams[0].width !== W || probe.streams[0].height !== H) throw new Error('Invalid rendered movie: ' + id);
  if (!probe.streams.some(stream => stream.codec_type === 'audio' && stream.codec_name === 'aac')) throw new Error('Missing narration audio: ' + id);
  const file = fs.readFileSync(destination);
  if (file.indexOf('moov') > file.indexOf('mdat')) throw new Error('Movie not optimized for streaming');
  // Older application shells must receive the new edit too, not an obsolete film.
  const aliases = [ `${id}-studio-20261108`, ...(id === 'descubrir' ? ['descubrir', 'descubrir-dmp-20261107']
    : id === 'recorrido' ? ['recorrido', 'crear-recorrido-dmp-20261107']
    : [id, `${id}-pantalla-completa`, ...(id === 'tecnico' ? ['tecnico-recorrido'] : [])]) ];
  for (const alias of aliases) {
    fs.copyFileSync(destination, path.join(output, alias + '.mp4'));
    for (const extension of ['jpg', 'vtt']) {
      const old = path.join(output, alias + '.' + extension);
      if (fs.existsSync(old)) fs.copyFileSync(path.join(output, name + '.' + extension), old);
    }
  }
  manifest.push({ id, name, seconds: Number(elapsed.toFixed(3)), bytes: file.length, width: W, height: H, fps: FPS, voice: 'F2', synthetic: true });
}
fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2));
if (!process.argv[2]) {
  fs.writeFileSync(path.resolve('scripts/demo/studio-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'narrated-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const catalog = Object.fromEntries(manifest.map(film => [film.id, { file: film.name, seconds: Math.ceil(film.seconds), voice: film.voice }]));
  fs.writeFileSync(path.resolve('src/demo/introVideos.ts'), '// Generated by scripts/demo/render-studio-videos.mjs.\nexport const introVideos = ' + JSON.stringify(catalog, null, 2) + ' as const;\n');
}
console.log(JSON.stringify(manifest, null, 2));
