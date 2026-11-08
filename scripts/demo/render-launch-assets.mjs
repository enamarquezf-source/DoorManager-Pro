// Native DMP artwork and real, fictitious-data screenshots. No external image service.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('.demo-tools/video-tools/package.json'));
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const QRCode = createRequire(path.resolve('.demo-tools/launch-tools/package.json'))('qrcode');
const origin = 'https://demo-doormanager-pro.pages.dev/';
const publicDir = path.resolve('public/demo-share');
const kitDir = path.resolve('docs/lanzamiento/assets');
fs.mkdirSync(publicDir, { recursive: true }); fs.mkdirSync(kitDir, { recursive: true });
GlobalFonts.registerFromPath('C:/Windows/Fonts/segoeui.ttf', 'DMP');
GlobalFonts.registerFromPath('C:/Windows/Fonts/segoeuib.ttf', 'DMP Bold');
const ink = '#143b42', mint = '#a7e0c9', muted = '#c0d6d1';
function label(ctx, text, x, y, size, color = '#f8fbf9', bold = false) {
  ctx.font = `${size}px "${bold ? 'DMP Bold' : 'DMP'}"`; ctx.fillStyle = color; ctx.fillText(text, x, y);
}
function rect(ctx, x, y, width, height, radius, color) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fill();
}
function mark(ctx, x, y, size, color) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 48, size / 48); ctx.strokeStyle = color;
  ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(8, 40); ctx.lineTo(8, 8); ctx.lineTo(35, 8); ctx.lineTo(35, 40); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(16, 13); ctx.lineTo(35, 8); ctx.lineTo(35, 40); ctx.lineTo(16, 35); ctx.closePath(); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(4, 40); ctx.lineTo(43, 40);
  ctx.moveTo(16, 19); ctx.lineTo(35, 16); ctx.moveTo(16, 26); ctx.lineTo(35, 25); ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(29, 30, 1.7, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

const canvas = createCanvas(1200, 630), ctx = canvas.getContext('2d');
ctx.fillStyle = ink; ctx.fillRect(0, 0, 1200, 630);
ctx.strokeStyle = '#275159'; ctx.lineWidth = 1;
for (let x = 800; x < 1200; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 630); ctx.stroke(); }
mark(ctx, 56, 39, 48, mint); label(ctx, 'DoorManager Pro', 120, 75, 31, '#fff', true);
rect(ctx, 60, 116, 276, 36, 18, '#27564f'); label(ctx, 'BETA PÚBLICA · SIN REGISTRO', 76, 140, 15, '#d5f1e3', true);
label(ctx, 'Del aviso al cobro.', 56, 245, 60, '#fff', true);
label(ctx, 'Todo conectado.', 56, 318, 60, mint, true);
label(ctx, 'Partes, equipos y gestión económica para', 60, 371, 23, muted);
label(ctx, 'empresas instaladoras y de mantenimiento.', 60, 406, 23, muted);
for (const [i, word] of ['Partes', 'Checks', 'Equipos', 'Costes'].entries()) {
  rect(ctx, 60 + i * 130, 439, 116, 36, 9, '#244b51'); label(ctx, word, 78 + i * 130, 463, 17, '#e0eee7');
}
rect(ctx, 60, 504, 254, 52, 12, mint); label(ctx, 'Prueba la demo  →', 82, 539, 23, ink, true);
const roles = [['01', 'SAT', 'Prepara el trabajo'], ['02', 'Técnico', 'Revisa y documenta'], ['03', 'Oficina', 'Factura y sigue cobros'], ['04', 'Gerencia', 'Analiza los resultados']];
for (const [i, [number, role, detail]] of roles.entries()) {
  const y = 138 + i * 99;
  if (i < roles.length - 1) { ctx.strokeStyle = mint; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(865, y + 72); ctx.lineTo(865, y + 102); ctx.stroke(); }
  rect(ctx, 814, y, 326, 80, 15, '#f0f7f3');
  rect(ctx, 830, y + 20, 43, 40, 10, '#d8ebe0'); label(ctx, number, 840, y + 47, 18, ink, true);
  label(ctx, role, 888, y + 32, 22, ink, true); label(ctx, detail, 888, y + 58, 16, '#45676a');
}
label(ctx, 'demo-doormanager-pro.pages.dev', 60, 598, 19, muted);
label(ctx, 'Proyecto de Francisco Javier Ena Márquez', 810, 598, 13, muted);
for (const extension of ['jpg', 'png']) {
  const bytes = canvas.toBuffer(extension === 'jpg' ? 'image/jpeg' : 'image/png');
  fs.writeFileSync(path.join(publicDir, 'dmp-beta-social.' + extension), bytes);
  fs.writeFileSync(path.join(kitDir, 'dmp-beta-social.' + extension), bytes);
}
const icon = createCanvas(240, 240), iconCtx = icon.getContext('2d');
rect(iconCtx, 0, 0, 240, 240, 45, ink); mark(iconCtx, 36, 36, 168, mint);
fs.writeFileSync(path.join(kitDir, 'dmp-icono.png'), icon.toBuffer('image/png'));
await QRCode.toFile(path.join(kitDir, 'dmp-demo-qr.png'), origin, { width: 600, margin: 4, errorCorrectionLevel: 'M', color: { dark: ink, light: '#ffffff' } });
for (const [frame, title, name] of [
  ['sat-parte', 'SAT · Prepara el trabajo', '01-sat'],
  ['tecnico-check', 'Técnico · Revisa cada equipo', '02-tecnico'],
  ['oficina-revision', 'Oficina · Revisa la factura', '03-oficina'],
  ['gerencia-rentabilidad', 'Gerencia · Entiende los costes', '04-gerencia'],
  ['comercial-importes', 'Comercial · Prepara tu propuesta', '05-comercial'],
]) {
  const c = createCanvas(1200, 900), g = c.getContext('2d');
  g.fillStyle = '#edf4ef'; g.fillRect(0, 0, 1200, 900);
  mark(g, 36, 24, 40, ink); label(g, title, 96, 57, 29, ink, true);
  label(g, 'Pantalla real de la demo · Datos ficticios', 40, 101, 18, '#48696b');
  const img = await loadImage(path.resolve('scripts/demo/source-frames/' + frame + '.jpg'));
  const scale = Math.min(1120 / img.width, 730 / img.height);
  const width = img.width * scale, height = img.height * scale;
  g.drawImage(img, Math.round((1200 - width) / 2), 130, width, height);
  label(g, 'DoorManager Pro · Beta pública', 40, 881, 15, '#48696b');
  fs.writeFileSync(path.join(kitDir, name + '.jpg'), c.toBuffer('image/jpeg'));
}
console.log('Created social artwork, icon, QR and five labelled screenshots.');
