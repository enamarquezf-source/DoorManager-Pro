import type { BusinessDocument } from './businessDocument';

/** A paginated A4 document. Customer data is prepared separately from internal reports. */
export async function createBusinessDocumentPdf(doc: BusinessDocument) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ compress: true, putOnlyUsedFonts: true });
  const ink = '#173f47', muted = '#586d71', pale = '#edf5f2', rule = '#d5e3de';
  const left = 16, right = 194, width = right - left, bottom = 275;
  let y = 32;
  const clean = (s: string) => s.replace(/[–—‑−]/g, '-').replace(/[\u00a0\u202f]/g, ' ');
  const font = (size = 9, bold = false, color = ink) => { pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(size); pdf.setTextColor(color); };
  const wrap = (s: string, w = width, size = 9) => { font(size); return pdf.splitTextToSize(clean(s), w) as string[]; };
  function header() {
    pdf.setFillColor(ink); pdf.rect(0, 0, 210, 21, 'F');
    font(10, true, '#ffffff'); pdf.text('DMP / DOORMANAGER PRO', left, 13);
    font(8, false, '#d5e6df'); pdf.text(clean(doc.kind.toUpperCase()), right, 13, {align:'right'});
    pdf.setFillColor('#89b99d'); pdf.rect(left, 21, 22, 1.3, 'F');
  }
  function reserve(h: number) {
    if (y + h <= bottom) return;
    pdf.addPage(); header(); y = 31;
    font(8, true, muted); pdf.text(clean(`${doc.code} · Continuación`), left, y); y += 9;
  }
  function write(value: string, size = 9, bold = false, color = ink) {
    for (const line of wrap(value, width, size)) { reserve(size * .47); font(size,bold,color);pdf.text(line,left,y);y+=size*.47; }
  }
  function heading(title: string) {
    reserve(19); y += 5; font(10,true);pdf.text(clean(title),left,y);
    pdf.setDrawColor(rule);pdf.line(left,y+3,right,y+3);y+=10;
  }
  function table(columns: string[], rows: string[][], widths: number[]) {
    const tableHeader = () => {
      pdf.setFillColor(pale);pdf.rect(left,y-4,width,8,'F');
      let x=left;
      columns.forEach((c,i)=>{font(7,true,muted);pdf.text(clean(c),x+2,y+1);x+=widths[i];});y+=8;
    };
    reserve(20);tableHeader();
    rows.forEach((row, rowIndex) => {
      const cells = columns.map((_,i)=>wrap(row[i]??'',widths[i]-4,8));
      // Split very long rows across pages instead of overflowing the footer.
      const lines = Math.max(1,...cells.map(c=>c.length));
      let offset=0;
      while(offset<lines){
        if(y+8>bottom){reserve(bottom);tableHeader();}
        const count=Math.max(1,Math.min(lines-offset,Math.floor((bottom-y-4)/4)));
        const height=count*4+4;
        if(rowIndex%2===1){pdf.setFillColor('#f8faf9');pdf.rect(left,y-3,width,height,'F');}
        let x=left;
        cells.forEach((cell,i)=>{font(8,false);pdf.text(cell.slice(offset,offset+count),x+2,y+1,{lineHeightFactor:1.4});x+=widths[i];});
        y+=height;offset+=count;
        pdf.setDrawColor(rule);pdf.line(left,y-3,right,y-3);
      }
    });y+=3;
  }
  pdf.setProperties({title:`${doc.kind} · ${doc.code}`,creator:'DoorManager Pro',subject:doc.title});
  header();
  write(doc.code,24,true);y+=3;write(doc.title,13,true);y+=3;
  write([doc.date,doc.status].filter(Boolean).join(' · '),9,false,muted);y+=7;
  const panels = [['EMPRESA EMISORA',doc.issuer],['CLIENTE',doc.customer]] as [string,string[]][];
  const panelWidth = 85;
  const panelLines = panels.map(([,lines])=>lines.flatMap((line,i)=>wrap(line,panelWidth-8,i===0?10:9).map(value=>({value,bold:i===0}))));
  const panelHeight=Math.max(...panelLines.map(lines=>lines.length))*4.5+16;
  if(panelHeight<180){
    reserve(panelHeight+5);
    panels.forEach(([label],i)=>{
      const x=left+i*(panelWidth+8);
      pdf.setFillColor(pale);pdf.roundedRect(x,y-4,panelWidth,panelHeight,2,2,'F');
      font(7,true,muted);pdf.text(label,x+4,y+3);
      panelLines[i].forEach((line,n)=>{font(line.bold?10:9,line.bold);pdf.text(line.value,x+4,y+10+n*4.5);});
    });y+=panelHeight+5;
  }else{
    for(const [label,lines] of panels){heading(label);lines.forEach(line=>write(line));}
  }
  if(doc.reference.length){font(7,true,muted);reserve(15);pdf.text('REFERENCIAS DEL TRABAJO',left,y);y+=5;doc.reference.forEach(line=>write(line,9));y+=4;}
  for(const section of doc.sections){
    heading(section.title);
    if(section.text)write(section.text);
    if(section.rows?.length&&section.columns)table(section.columns,section.rows,section.widths??section.columns.map(()=>width/section.columns!.length));
  }
  if(doc.totals?.length){
    reserve(Math.min(doc.totals.length*10+12,90));y+=8;
    for(const total of doc.totals){
      reserve(13);
      if(total.emphasis){pdf.setFillColor(ink);pdf.roundedRect(left,y-5,width,12,2,2,'F');}
      font(total.emphasis?11:9,total.emphasis,total.emphasis?'#ffffff':muted);pdf.text(clean(total.label),left+4,y+2);
      font(total.emphasis?14:10,true,total.emphasis?'#ffffff':ink);pdf.text(clean(total.value),right-4,y+2,{align:'right'});y+=total.emphasis?17:10;
    }
  }
  if(doc.notice){y+=5;write(doc.notice,8,false,muted);}
  const pages=pdf.getNumberOfPages();
  for(let i=1;i<=pages;i++){
    pdf.setPage(i);pdf.setDrawColor(rule);pdf.line(left,282,right,282);
    font(7,false,muted);pdf.text(clean(`${doc.kind} · ${doc.code}`),left,287);
    pdf.text(`${i} / ${pages}`,right,287,{align:'right'});
  }
  return pdf;
}
