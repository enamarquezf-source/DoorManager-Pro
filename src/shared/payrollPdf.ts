import { payrollAmounts } from './employeeHr';
export async function payrollSimulationPdf(employee: string, company: string, from: string, to: string, payload: Record<string, any>) {
  if(payload.mode!=='simulation') throw new Error('Los PDF generados en la beta son exclusivamente simulaciones.');
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF();
  const totals = payrollAmounts(payload);
  const money = (value: number) => value.toLocaleString('es-ES', {minimumFractionDigits:2,maximumFractionDigits:2})+' EUR';
  pdf.setFillColor(16,63,64); pdf.rect(0,0,210,32,'F'); pdf.setTextColor(255,255,255); pdf.setFontSize(18); pdf.text('Simulación de nómina | BETA',18,20);
  pdf.setTextColor(125,82,20); pdf.setFillColor(250,242,220); pdf.rect(18,40,174,18,'F'); pdf.setFontSize(10); pdf.text('PRUEBA INTERNA - SIN VALIDEZ COMO NÓMINA OFICIAL',22,51);
  let y=72;
  function text(label:string,value:string) { pdf.setTextColor(40,65,66); pdf.setFontSize(10); const lines=pdf.splitTextToSize(`${label}: ${value}`,170); pdf.text(lines,18,y); y+=lines.length*5+5; }
  text('Empresa',company.slice(0,160)); text('Empleado',employee.slice(0,160)); text('Periodo',`${from} / ${to}`);
  y+=2;
  const rows:[string,number][] = [['Salario base',Number(payload.salary_base)],['Complementos',Number(payload.supplements)], [`Horas extra (${Number(payload.overtime_hours)} h x ${money(Number(payload.overtime_hourly_price))})`,totals.overtime_amount],['Total bruto simulado',totals.gross_amount],['Deducciones introducidas',Number(payload.employee_deductions)],['Neto simulado',totals.net_amount],['Cotizaciones de empresa introducidas',Number(payload.employer_contributions)],['Otros costes empresariales',Number(payload.other_employer_costs)],['Coste total de empresa',totals.employer_cost]];
  pdf.setFontSize(10);
  rows.forEach(([label,value],index)=>{if(index===3||index===5||index===8){pdf.setFillColor(235,244,239);pdf.rect(18,y-6,174,11,'F');pdf.setFont('helvetica','bold');}else pdf.setFont('helvetica','normal');pdf.setTextColor(40,65,66);pdf.text(label,22,y);pdf.text(money(value),188,y,{align:'right'});y+=12;});
  pdf.setFont('helvetica','normal');pdf.setFontSize(9);pdf.setTextColor(95,105,105);
  const note=pdf.splitTextToSize('Los importes y deducciones se han introducido para probar DMP. No se calculan automáticamente IRPF, bases ni cuotas legales. No acredita pago ni sustituye el recibo oficial de salarios.',174);
  pdf.text(note,18,y+8);
  if(payload.notes) { const notes=pdf.splitTextToSize(`Notas: ${String(payload.notes).slice(0,1200)}`,174); let noteY=y+note.length*5+17; for(const line of notes){if(noteY>276){pdf.addPage();noteY=20;}pdf.text(line,18,noteY);noteY+=5;} }
  return pdf.output('blob');
}
