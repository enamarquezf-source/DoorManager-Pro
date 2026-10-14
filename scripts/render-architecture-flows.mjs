import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'docs/architecture-map');
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function make(name,title,subtitle,cards,notes){
 const width=2400,height=1840,scene={width,height,background:'#eef3f5',items:[]};let s='';
 function rect(x,y,w,h,fill,stroke='',radius=16){scene.items.push({type:'rect',x,y,w,h,fill,stroke,radius});s+=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" ${stroke?`stroke="${stroke}"`:''}/>`;}
 function text(x,y,t,size=25,fill='#244a56',weight=400){scene.items.push({type:'text',x,y,text:t,size,fill,weight});s+=`<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}">${esc(t)}</text>`;}
 function line(x1,y1,x2,y2){scene.items.push({type:'line',x1,y1,x2,y2,stroke:'#5b9c91',strokeWidth:4});s+=`<path d="M${x1} ${y1}L${x2} ${y2}" stroke="#5b9c91" stroke-width="4" marker-end="url(#arrow)"/>`;}
 rect(0,0,width,235,'#143d46','',0);text(80,65,'DMP / ARQUITECTURA EN USO',23,'#9ad7c7',700);text(80,135,title,54,'#fff',700);text(80,193,subtitle,25,'#d2e6e8');
 const spots=[];const cw=690,ch=345,gapX=85,gapY=65,startX=80,startY=290;
 cards.forEach((card,i)=>{const row=Math.floor(i/3),col=row%2?2-i%3:i%3;spots.push({x:startX+col*(cw+gapX),y:startY+row*(ch+gapY)});});
 for(let i=1;i<spots.length;i++){const a=spots[i-1],b=spots[i];if(a.y===b.y){const right=b.x>a.x;line(a.x+(right?cw:0),a.y+ch/2,b.x+(right?0:cw),b.y+ch/2)}else line(a.x+cw/2,a.y+ch,b.x+cw/2,b.y);}
 cards.forEach((card,i)=>{const{x,y}=spots[i];rect(x,y,cw,ch,'#fff','#d6e2e6',20);rect(x,y,8,ch,card.color||'#2d8c7c','',3);text(x+28,y+49,String(i+1).padStart(2,'0'),25,'#458e80',700);text(x+92,y+50,card.title,32,'#173e47',700);card.lines.forEach((t,j)=>text(x+28,y+105+j*34,t,25,j<2?'#295461':'#607781',j<2?600:400));});
 const ny=1580;rect(80,ny,2240,185,'#dcece7','',18);text(110,ny+45,notes[0],27,'#194a42',700);notes.slice(1).forEach((n,i)=>text(110,ny+88+i*34,n,24,'#315e58'));
 text(80,1810,'Fuentes: catálogo real de Supabase (14/10/2026) + servicios React/TypeScript del repositorio. Flujo explicativo, no ejecución de operaciones.',20,'#617985');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Segoe UI,Arial,sans-serif"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#5b9c91"/></marker></defs><rect width="100%" height="100%" fill="#eef3f5"/>${s}</svg>`;
 fs.writeFileSync(path.join(out,name+'.svg'),svg);fs.writeFileSync(path.join(out,name+'-scene.json'),JSON.stringify(scene));
}
make('DMP-recorrido-del-dato','De un presupuesto a una factura cobrada','Lectura orientativa del negocio. Las revisiones SAT, Comercial y económica son controles complementarios.',[
 {title:'Cliente y equipo',lines:['clients → sites → equipment','Quién, dónde y sobre qué se actúa.','Contactos y acceso completan el contexto.','cases agrupa el expediente cuando existe.']},
 {title:'Presupuesto',color:'#b7862c',lines:['quotes + quote_lines','Define conceptos, cantidades y venta.','Materiales y tarifas pueden vincularse.','Sus líneas no son consumos reales.']},
 {title:'Parte asociado',lines:['work_orders + work_order_equipment','Conserva vínculo con el presupuesto.','Se asignan técnico, centro y equipos.','Trigger: al asociar equipo se genera check.']},
 {title:'Trabajo del técnico',lines:['Horas + materiales + recursos','Checks, resultados, fotos y firma.','Las decisiones técnicas registran ejecución.','Sin conexión: cola local → sincronización.']},
 {title:'Revisión SAT / Comercial',lines:['dmp_review_work_order_sat','Se revisa la entrega y se elige destino.','Puede devolverse o pasar a Comercial.','El destino controla la cola de facturación.']},
 {title:'Revisión económica',color:'#b7862c',lines:['dmp_review_work_order_economic','Distingue coste real de venta aprobada.','Decide qué conceptos son facturables.','El presupuesto y las excepciones importan.']},
 {title:'Factura de cliente',lines:['invoices + invoice_work_orders','Preparar borrador → revisar → emitir.','La RPC comprueba elegibilidad e importes.','Finalizar un parte no emite una factura.']},
 {title:'Cobro y tesorería',lines:['invoice_payments','treasury_transactions + accounts','El cobro se vincula a factura y cuenta.','Emitir no equivale a haber cobrado.']},
 {title:'Consulta e historial',lines:['Vistas de cliente, equipo y economía','La app vuelve a consultar y muestra estado.','El historial combina hechos del sistema.','Documentos y auditoría conservan contexto.']}
],['Compras y stock forman una rama paralela','purchase_orders → purchase_receipts → stock_movements / warehouse_stock. Consumos validados: salida de stock.','supplier_invoices → supplier_invoice_payments → tesorería. La factura de proveedor no es la factura al cliente.']);
make('DMP-al-abrir-un-parte','Qué hace DMP cuando abres un parte','React muestra la pantalla; los servicios consultan Supabase; PostgreSQL verifica el acceso y los cambios.',[
 {title:'Entras en una ruta',lines:['React Router interpreta /app/…','El ID identifica el recurso solicitado.','La ruta elige pantalla y espacio de trabajo.','Una URL sola no concede acceso.']},
 {title:'Restaura la sesión',lines:['Supabase Auth + profiles','Auth identifica al usuario.','El perfil aporta empresa, actividad y roles.','Cambiar identidad limpia caché y contexto.']},
 {title:'Comprueba el acceso',lines:['Permisos de interfaz + RLS en BD','La app comprueba módulo y acción.','El técnico requiere asignación y estado.','PostgreSQL limita filas y operaciones.']},
 {title:'Consulta o reutiliza caché',lines:['useLoad → TanStack Query','La clave de caché incluye el ámbito.','Datos recientes pueden reutilizarse.','Refresco y errores tienen estado propio.']},
 {title:'Carga el contexto',lines:['workOrdersService','Cabecera, cliente, centro y equipos.','Luego asignaciones, horas y consumos.','Checks, decisiones, documentos y medios.']},
 {title:'Compone la pantalla',lines:['React combina los resultados','Muestra secciones y acciones por permiso.','Las fotos privadas usan URL firmadas.','Un fallo parcial puede impedir el detalle.']},
 {title:'El usuario guarda',lines:['Formulario → servicio → RPC o tabla','Se validan campos y permiso de acción.','Las RPC aplican controles de negocio.','Triggers ejecutan automatismos asociados.']},
 {title:'Conserva o sincroniza',lines:['PostgreSQL / Storage / IndexedDB','Datos estructurados van a tablas.','Binarios a Storage con metadatos en BD.','Lo local queda pendiente hasta sincronizar.']},
 {title:'Actualiza lo visible',lines:['Resultado o error → refresco','Se vuelve a consultar tras guardar.','La app recalcula resumen y estado.','Un error debe conservar contexto y datos.']}
],['Leer y escribir son recorridos diferentes','Abrir la ficha consulta información; las acciones explícitas pueden modificarla o ejecutar RPC con efectos de negocio.','La imagen describe el código revisado: no se han creado partes, facturas, consumos ni cobros para preparar este mapa.']);
console.log('2 diagramas de flujo SVG y escenas de renderizado creados.');
