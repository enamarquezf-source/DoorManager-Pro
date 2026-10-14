import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'docs/architecture-map');
const c=JSON.parse(fs.readFileSync(path.join(out,'catalog.json'),'utf8'));
const live=c.source==='live_pg_catalog';
if(!live) throw new Error('Este render exige catálogo real: usa --live al reconstruir el catálogo.');
const stamp=live?'SUPABASE REAL · 14 OCT 2026':'MIGRACIONES · PENDIENTE DE VERIFICACIÓN';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const key=t=>`${t.schema}.${t.name}`;
const groups=[
 ['identity','Identidad y permisos','#9b6bdd'],['clients','Clientes y centros','#3787bd'],
 ['equipment','Equipos y componentes','#178c8a'],['commercial','Presupuestos y tarifas','#d48a29'],
 ['cases','Expedientes','#6383c4'],['works','Partes y ejecución','#138f75'],
 ['checks','Checks y deficiencias','#bf646f'],['stock','Materiales y stock','#4b9a66'],
 ['purchasing','Compras y recepciones','#b28736'],['supplierInvoices','Facturas de proveedor','#bc7456'],
 ['invoices','Facturación de clientes','#5087be'],['treasury','Tesorería y pagos','#59845b'],
 ['documents','Documentos y archivos','#7874ad'],['alerts','Avisos','#c16d96'],
 ['registers','Vehículos y PRL','#668892'],['audit','Auditoría y operaciones','#718096'],
 ['views','Vistas: lecturas derivadas','#52687c'],['auth','Supabase Auth · interno','#8d94a8'],
 ['storage','Supabase Storage · interno','#8c9a8b'],['other','Otras tablas','#7d8a96']
].map(([id,name,color])=>({id,name,color,tables:[]}));
function groupFor(t){
 if(t.schema==='auth')return'auth';if(t.schema==='storage')return'storage';if(t.kind!=='table')return'views';
 const n=t.name;
 if(/^(companies|profiles|roles|permissions|profile_|role_|platform_superadmins|auth_invite_intents|app_modules)/.test(n))return'identity';
 if(/^(clients|client_contacts|sites|site_contacts|access_requirements)$/.test(n))return'clients';
 if(/^equipment/.test(n))return'equipment';
 if(/^(quotes|quote_|opportunities|rate_|technician_hour_rates)/.test(n))return'commercial';
 if(/^case/.test(n))return'cases';if(/^work_order/.test(n))return'works';
 if(/^(check|deficiencies|corrective_actions)/.test(n))return'checks';
 if(/^(material|stock_|warehouse)/.test(n))return'stock';
 if(/^supplier_invoice/.test(n))return'supplierInvoices';
 if(/^(purchase_|suppliers|supplier_bank_accounts)/.test(n))return'purchasing';
 if(/^invoice/.test(n))return'invoices';if(/^treasury/.test(n))return'treasury';
 if(/^(documents|document_links|files|storage_cleanup_queue)$/.test(n))return'documents';
 if(/^alert/.test(n))return'alerts';if(/^(vehicles|personnel_certificates)$/.test(n))return'registers';
 if(/log|receipts|purge/.test(n))return'audit';return'other';
}
for(const t of c.tables_and_views){t.group=groupFor(t);groups.find(g=>g.id===t.group).tables.push(t);}
const active=groups.filter(g=>g.tables.length);
const width=5600, margin=90, gap=90, cols=4, columnW=(width-margin*2-gap*(cols-1))/cols;
const bottoms=Array(cols).fill(420),positions=new Map();
const scene={width,height:0,background:'#eef3f6',items:[]};let layer=0;
function rect(x,y,w,h,fill,stroke='',radius=12){scene.items.push({type:'rect',x,y,w,h,fill,stroke,radius,layer});return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" ${stroke?`stroke="${stroke}"`:''}/>`;}
function text(x,y,label,size=24,fill='#173c46',weight=400){scene.items.push({type:'text',x,y,text:String(label),size,fill,weight,layer});return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}">${esc(label)}</text>`;}
let top=rect(0,0,width,320,'#123841','',0)+text(90,80,'DMP / MAPA COMPLETO DE DATOS',28,'#91d3c6',700)+text(90,155,'Cómo se enlaza DoorManager Pro',64,'#fff',700);
top+=text(90,220,`${c.tables_and_views.filter(t=>t.kind==='table').length} tablas · ${c.tables_and_views.filter(t=>t.kind!=='table').length} vistas · ${c.foreign_keys.length} FK · ${c.view_dependencies.length} dependencias de vistas`,31,'#d5e9e8');
top+=text(90,275,`${stamp}   |   Continua: hija → padre (FK). Discontinua: vista → tabla consultada.`,23,'#bcd7da');
let panels='',backgroundPanels='';
for(const g of active){
 const col=bottoms.indexOf(Math.min(...bottoms)),x=margin+col*(columnW+gap),y=bottoms[col];
 const h=115+g.tables.length*62;bottoms[col]=y+h+60;
 g.x=x;g.y=y;g.w=columnW;g.h=h;
 layer=1;
 backgroundPanels+=rect(x-15,y-15,columnW+30,h,'#ffffff','#d2dde4',24);
 backgroundPanels+=rect(x-15,y-15,columnW+30,70,g.color,'',16);
 backgroundPanels+=text(x+15,y+29,g.name,29,'#ffffff',700)+text(x+columnW-65,y+29,g.tables.length,25,'#ffffff',700);
 layer=3;
 for(let i=0;i<g.tables.length;i++){
  const t=g.tables[i],ty=y+75+i*62,id=key(t);
  positions.set(id,{x,y:ty,w:columnW,h:54,t});
  const outgoing=c.foreign_keys.filter(f=>`${f.from_schema}.${f.from_table}`===id).length;
  const label=`${t.schema==='public'?'':t.schema+'.'}${t.name}`;
  panels+=`<g class="table-node" data-table="${esc(id)}" role="button" tabindex="0" aria-label="${esc(id)}"><title>${esc(id)} · ${t.columns.length} columnas · ${outgoing} FK salientes</title>`;
  panels+=rect(x,ty,columnW,54,i%2?'#f1f5f8':'#f8fafc','',10);
  panels+=text(x+16,ty+35,label,Math.min(25,label.length>44?20:25),'#193e48',t.kind==='table'?600:400);
  panels+=text(x+columnW-100,ty+34,`${t.columns.length}c / ${outgoing}↗`,17,'#617786');
  panels+='</g>';
 }
}
const height=Math.max(...bottoms)+120;scene.height=height;
let edges='';let represented=0;const missing=[];
for(let i=0;i<c.foreign_keys.length;i++){
 const f=c.foreign_keys[i],from=`${f.from_schema}.${f.from_table}`,to=`${f.to_schema}.${f.to_table}`;
 const a=positions.get(from),b=positions.get(to);if(!a||!b){missing.push(f);continue;}
 let x1,x2,y1=a.y+27,y2=b.y+27,c1,c2;
 if(a.x===b.x){x1=a.x+a.w;x2=b.x+b.w;const d=25+(i%9)*6;c1=x1+d;c2=x2+d;}
 else if(a.x<b.x){x1=a.x+a.w;x2=b.x;c1=x1+70+(i%7)*9;c2=x2-70-(i%7)*9;}
 else{x1=a.x;x2=b.x+b.w;c1=x1-70-(i%7)*9;c2=x2+70+(i%7)*9;}
 const color=groups.find(g=>g.id===a.t.group).color;
 scene.items.push({type:'curve',x1,y1,c1x:c1,c1y:y1,c2x:c2,c2y:y2,x2,y2,stroke:color,layer:2});
 edges+=`<path class="fk-edge" data-from="${esc(from)}" data-to="${esc(to)}" d="M${x1},${y1} C${c1},${y1} ${c2},${y2} ${x2},${y2}" fill="none" stroke="${color}" stroke-width="1.8" opacity=".25" marker-end="url(#arrow)"><title>${esc(`${f.name}: ${from}(${f.from_columns.join(',')}) → ${to}(${f.to_columns.join(',')})`)}</title></path>`;represented++;
}
let representedViews=0;
for(let i=0;i<c.view_dependencies.length;i++){
 const v=c.view_dependencies[i],from=v.view||`${v.view_schema}.${v.view_name}`,to=v.table||`${v.table_schema}.${v.table_name}`;
 const a=positions.get(from),b=positions.get(to);if(!a||!b)continue;
 const right=a.x<=b.x,x1=a.x+(right?a.w:0),x2=b.x+(right?0:b.w),y1=a.y+27,y2=b.y+27,c1=x1+(right?80:-80),c2=x2+(right?-80:80);
 edges+=`<path class="fk-edge view-edge" data-from="${esc(from)}" data-to="${esc(to)}" d="M${x1},${y1} C${c1},${y1} ${c2},${y2} ${x2},${y2}" fill="none" stroke="#617786" stroke-width="1.6" stroke-dasharray="9 7" opacity=".2"><title>${esc(`Vista ${from} consulta ${to}`)}</title></path>`;
 scene.items.push({type:'curve',x1,y1,c1x:c1,c1y:y1,c2x:c2,c2y:y2,x2,y2,stroke:'#617786',layer:2,dashed:true});representedViews++;
}
layer=4;const footer=text(90,height-60,`${positions.size} objetos representados. Catálogo: ${c.captured_at}. c = columnas; ↗ = claves foráneas salientes.`,23,'#526b78');
// Draw edges before opaque panels, leaving cross-module paths in the gutters.
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Segoe UI,Arial,sans-serif"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#617786"/></marker></defs><rect width="100%" height="100%" fill="#eef3f6"/>${top}${backgroundPanels}<g id="edges">${edges}</g><g id="tables">${panels}</g>${footer}</svg>`;
fs.writeFileSync(path.join(out,'DMP-tablas-relaciones.svg'),svg);
// Raster renderer receives the same labels/geometry, with curves behind panels.
scene.items.sort((a,b)=>a.layer-b.layer);
fs.writeFileSync(path.join(out,'schema-scene.json'),JSON.stringify(scene));
const csv='constraint,from_table,from_columns,to_table,to_columns\n'+c.foreign_keys.map(f=>[f.name,`${f.from_schema}.${f.from_table}`,f.from_columns.join(';'),`${f.to_schema}.${f.to_table}`,f.to_columns.join(';')].map(s=>'"'+s.replaceAll('"','""')+'"').join(',')).join('\n');
fs.writeFileSync(path.join(out,'relaciones-completas.csv'),'\ufeff'+csv);
const json=JSON.stringify(c).replaceAll('<','\\u003c');
const html=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DMP · Atlas real de datos</title><style>
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,sans-serif;color:#163c45;background:#edf3f5}header{padding:22px 28px;background:#123841;color:white}header h1{margin:5px 0;font-size:27px}header p{margin:3px 0;color:#c0d9dc}.badge{font-size:11px;letter-spacing:2px;color:#9ce0cf}nav{padding:14px 28px;display:flex;flex-wrap:wrap;gap:10px;background:white;border-bottom:1px solid #d5e1e5}button,input,select{font:inherit;border:1px solid #bfced4;border-radius:9px;padding:9px 12px;background:white;color:#163c45}button{cursor:pointer}button:hover,button.active{background:#dceee8;border-color:#418c7e}button:focus-visible,input:focus-visible{outline:3px solid #48a58e;outline-offset:2px}input{min-width:260px}.layout{display:grid;grid-template-columns:minmax(0,1fr) 380px;min-height:78vh}#map{overflow:auto;height:78vh;background:#eef3f6}#map svg{display:block;width:3000px;height:auto;max-width:none}.table-node{cursor:pointer}.table-node:focus{outline:4px solid #007665}.selected .table-node:not(.chosen):not(.neighbor){opacity:.24}.selected .fk-edge:not(.chosen){opacity:.025}.fk-edge.chosen{stroke:#00836f;stroke-width:6;opacity:1}.table-node.chosen>rect{stroke:#00836f;stroke-width:5}.table-node.neighbor>rect{stroke:#5a8f9a;stroke-width:3}aside{background:#fff;padding:22px;overflow:auto;height:78vh;border-left:1px solid #d5e1e5}h2{font-size:20px}h3{margin-top:24px;font-size:16px}aside h2{overflow-wrap:anywhere}small,.muted{color:#5c7580}ul{padding-left:20px}.column{display:flex;gap:7px;justify-content:space-between;padding:5px 0;border-bottom:1px solid #edf1f4;font-size:12px}.column code{overflow-wrap:anywhere}.relation{display:block;width:100%;text-align:left;margin:6px 0;font-size:12px;overflow-wrap:anywhere}.flow{display:none;max-width:1160px;padding:25px;margin:auto}.flow.active{display:block}.flow img{width:100%;height:auto;border-radius:14px;background:#fff}.notice{padding:14px;border:1px solid #e7d39a;background:#fff7df;border-radius:12px}.source{font-family:ui-monospace,monospace;font-size:12px;overflow-wrap:anywhere}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:15px}.card{background:#fff;border:1px solid #d5e1e5;border-radius:14px;padding:18px}.card h3{margin-top:0}table{border-collapse:collapse;width:100%;background:white;font-size:13px}th,td{padding:10px;text-align:left;border-bottom:1px solid #dbe5e9}a{color:#087967}#results{max-width:330px;max-height:220px;overflow:auto}#results button{display:block;margin:4px 0;width:100%;text-align:left;font-size:12px}@media(max-width:850px){.layout{grid-template-columns:1fr}aside{height:auto}.cards{grid-template-columns:1fr}header,nav{padding:16px}}@media print{nav{display:none}.layout{display:block}#map{height:auto;overflow:visible}#map svg{width:100%}aside{display:none}}
</style><header><div class="badge">CATÁLOGO REAL · SUPABASE · 14 OCTUBRE 2026</div><h1>Cómo está conectado DMP</h1><p>124 tablas · 15 vistas · 354 claves foráneas · estructura, sin registros de negocio</p></header><nav><button class="active" data-view="schema">Tablas y relaciones</button><button data-view="flow">Recorrido de un dato</button><button data-view="screen">Al abrir una pantalla</button><button data-view="sources">Fuentes y límites</button><input id="search" type="search" placeholder="Buscar tabla: work_orders, checks…" aria-label="Buscar tabla"><button id="less" aria-label="Alejar mapa">−</button><button id="more" aria-label="Acercar mapa">+</button><button id="reset">Ver todas</button></nav><section class="layout" id="schema"><div id="map">${svg}</div><aside><div id="results"></div><div id="detail"><h2>Selecciona una tabla</h2><p>Verás todas sus columnas y las claves foráneas que entran y salen. Las líneas verdes resaltan solo sus relaciones.</p><p>Las flechas van de la tabla hija a la tabla que referencia. Varias flechas entre dos tablas pueden representar campos diferentes.</p><h3>Dos tipos de información</h3><p><b>FK reales:</b> relaciones garantizadas por PostgreSQL.</p><p><b>Enlaces lógicos:</b> documentos y avisos también usan un tipo de entidad y un identificador; no todos estos enlaces son una FK. Se explican en el recorrido.</p><small>Desplázate horizontal y verticalmente o usa + / − para explorar el mapa. El SVG conserva nitidez al ampliar.</small></div></aside></section>
<section class="flow" id="flow"><h2>Del presupuesto al cobro</h2><p>Las flechas siguientes describen el flujo del programa; no sustituyen a las FK del mapa.</p><img src="DMP-recorrido-del-dato.svg" alt="Recorrido desde presupuesto y parte hasta revisión, factura y cobro"><div class="cards"><article class="card"><h3>Previsto frente a real</h3><p><code>quote_lines</code> contiene lo presupuestado. Horas, consumos y recursos del parte registran lo ejecutado. La revisión económica decide la venta aprobada; no se obtiene simplemente sumando todos los costes.</p></article><article class="card"><h3>Stock con trazabilidad</h3><p>Una recepción confirmada y un consumo validado son operaciones distintas. La recepción registra entradas; la validación de consumo registra salidas. Se relacionan con almacenes, movimientos y cantidades disponibles.</p></article><article class="card"><h3>Datos locales del técnico</h3><p>IndexedDB conserva cambios pendientes separados por perfil y empresa. Guardar en el dispositivo no equivale a haberlos enviado a Supabase. La sincronización comunica el éxito o el error de cada cambio.</p></article></div></section>
<section class="flow" id="screen"><h2>Qué ocurre al abrir un parte</h2><img src="DMP-al-abrir-un-parte.svg" alt="Secuencia de navegación, sesión, permisos, consultas y renderizado"><h3>La lectura detallada reúne varias consultas</h3><p>El servicio carga cabecera, cliente, centro, expediente y equipo principal. Después reúne equipos asociados, plantillas, asignaciones, historial, horas, notas, consumos, conceptos previstos, decisiones, recursos, checks, deficiencias, avisos, documentos, firmas y fotos.</p><p>No es una única tabla gigante. Si hay presupuesto, se consultan además sus líneas y decisiones del parte. Si el perfil es técnico, se comprueba previamente su asignación y el estado operativo.</p><p>Los ficheros usan enlaces firmados con caducidad. Las vistas económicas son lecturas derivadas; los cambios sensibles suelen pasar por funciones PostgreSQL (RPC) que validan la operación.</p></section>
<section class="flow" id="sources"><h2>Qué está verificado</h2><p>Tablas, columnas, claves, vistas, triggers y nombres de funciones proceden de una exportación de <code>pg_catalog</code> del proyecto DMP, capturada el <b>${esc(c.captured_at)}</b>. El código explica cómo utiliza la aplicación esos objetos.</p><div class="notice">El catálogo exportado contiene estructura y metadatos, no registros de clientes ni claves. Las cifras de funciones incluyen funciones públicas auxiliares y de extensiones, no solo funciones de negocio.</div><h3>Ámbito</h3><ul><li>public: 89 tablas de DMP y 15 vistas.</li><li>auth: 27 tablas administradas por Supabase Auth.</li><li>storage: 8 tablas administradas por Supabase Storage.</li><li>354 FK dibujadas; cada una conserva su nombre y columnas en el catálogo/CSV.</li><li>Los recorridos se verifican en servicios y rutas del repositorio; no se han ejecutado operaciones de negocio.</li></ul><h3>Fuentes descargables</h3><p><a href="DMP-tablas-relaciones.svg">Mapa completo SVG</a> · <a href="DMP-tablas-relaciones.png">Imagen PNG</a> · <a href="relaciones-completas.csv">354 relaciones CSV</a> · <a href="live-catalog.json">Catálogo real JSON</a> · <a href="LEEME.md">Explicación y hallazgos</a></p><h3>Cómo se trazó el código</h3><table><thead><tr><th>Servicio</th><th>Tablas/vistas consultadas</th><th>RPC detectadas</th></tr></thead><tbody id="serviceRows"></tbody></table></section>
<script type="application/json" id="catalog">${json}</script><script>
const data=JSON.parse(document.getElementById('catalog').textContent),nodes=[...document.querySelectorAll('.table-node')],edges=[...document.querySelectorAll('.fk-edge')],svg=document.querySelector('#map svg'),detail=document.getElementById('detail');let zoom=3000;
const id=t=>t.schema+'.'+t.name;function clean(){svg.classList.remove('selected');nodes.forEach(n=>n.classList.remove('chosen','neighbor'));edges.forEach(n=>n.classList.remove('chosen'));}
function elem(tag,txt,cls){const el=document.createElement(tag);el.textContent=txt;if(cls)el.className=cls;return el;}
function choose(k){const t=data.tables_and_views.find(x=>id(x)===k);if(!t)return;clean();svg.classList.add('selected');const related=new Set();edges.forEach(e=>{if(e.dataset.from===k||e.dataset.to===k){e.classList.add('chosen');related.add(e.dataset.from);related.add(e.dataset.to)}});nodes.forEach(n=>n.classList.add(n.dataset.table===k?'chosen':related.has(n.dataset.table)?'neighbor':'plain'));detail.replaceChildren(elem('h2',k),elem('p',t.kind==='table'?'Tabla · RLS '+(t.rls_enabled?'activado':'desactivado'):'Vista · consulta derivada'));detail.append(elem('h3','Columnas ('+t.columns.length+')'));t.columns.forEach(col=>{const row=elem('div','','column');row.append(elem('code',(col.primary_key?'PK · ':'')+col.name),elem('small',col.type+(col.nullable?' · NULL':'')));detail.append(row)});const own=data.foreign_keys.filter(f=>f.from_schema+'.'+f.from_table===k||f.to_schema+'.'+f.to_table===k);detail.append(elem('h3','Relaciones ('+own.length+')'));own.forEach(f=>{const from=f.from_schema+'.'+f.from_table,to=f.to_schema+'.'+f.to_table;const b=elem('button',from+' ('+f.from_columns.join(', ')+') → '+to+' ('+f.to_columns.join(', ')+')','relation');b.onclick=()=>choose(from===k?to:from);b.title=f.name;detail.append(b)});const vd=(data.view_dependencies||[]).filter(v=>v.view_schema+'.'+v.view_name===k||v.table_schema+'.'+v.table_name===k);if(vd.length){detail.append(elem('h3','Dependencias de vistas ('+vd.length+')'));vd.forEach(v=>{const a=v.view_schema+'.'+v.view_name,b=v.table_schema+'.'+v.table_name;const x=elem('button',a+' consulta '+b,'relation');x.onclick=()=>choose(a===k?b:a);detail.append(x)})}const policies=(data.policies||[]).filter(p=>p.schema+'.'+p.table===k);detail.append(elem('h3','Políticas RLS ('+policies.length+')'));policies.forEach(p=>detail.append(elem('p',p.command+' · '+p.name,'source')));const triggers=(data.triggers||[]).filter(p=>p.schema+'.'+p.table===k);detail.append(elem('h3','Triggers ('+triggers.length+')'));triggers.forEach(p=>detail.append(elem('p',p.name+' → '+p.function,'source')));}
nodes.forEach(n=>{n.onclick=()=>choose(n.dataset.table);n.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(n.dataset.table)}}});document.getElementById('reset').onclick=()=>{clean();document.getElementById('search').value='';document.getElementById('results').replaceChildren()};document.getElementById('more').onclick=()=>{zoom=Math.min(8000,zoom*1.25);svg.style.width=zoom+'px'};document.getElementById('less').onclick=()=>{zoom=Math.max(800,zoom/1.25);svg.style.width=zoom+'px'};document.getElementById('search').oninput=e=>{const q=e.target.value.trim().toLowerCase(),r=document.getElementById('results');r.replaceChildren();if(!q)return;data.tables_and_views.filter(t=>id(t).toLowerCase().includes(q)).slice(0,25).forEach(t=>{const b=elem('button',id(t));b.onclick=()=>choose(id(t));r.append(b)})};document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('section.flow').forEach(s=>s.classList.toggle('active',s.id===b.dataset.view));document.getElementById('schema').style.display=b.dataset.view==='schema'?'grid':'none'});data.service_usage.forEach(s=>{const row=document.createElement('tr');[s.file,s.tables.join(', '),s.rpcs.join(', ')].forEach(v=>row.append(elem('td',v)));document.getElementById('serviceRows').append(row)});
</script></html>`;
fs.writeFileSync(path.join(out,'DMP-atlas.html'),html);
fs.writeFileSync(path.join(out,'render-check.json'),JSON.stringify({source:c.source,objects:positions.size,foreign_keys:c.foreign_keys.length,represented,view_dependencies:representedViews,missing,width,height},null,2));
console.log(JSON.stringify({objects:positions.size,foreign_keys:c.foreign_keys.length,represented,missing:missing.length,width,height,groups:active.map(g=>[g.name,g.tables.length])},null,2));
