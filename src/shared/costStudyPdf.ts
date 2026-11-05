import type { calculateCostStudy, StudyInputs } from './costStudy';

type CostStudyPdfData = {
  title: string;
  from: string;
  to: string;
  capturedAt: string;
  saved: boolean;
  report: ReturnType<typeof calculateCostStudy>;
  inputs: StudyInputs;
};

const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const number = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
const money = (value: number) => euros.format(value).replace(/^(\D*\d)(\d{3}),/, '$1.$2,').replace(/\s/g, ' ');
const date = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const clean = (value: string) => value.replace(/[–—−‑]/g, '-').replace(/\u00a0/g, ' ');

export async function createCostStudyPdf({ title, from, to, capturedAt, saved, report, inputs }: CostStudyPdfData) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ compress: true, putOnlyUsedFonts: true });
  pdf.setProperties({ title, subject: 'Informe de costes y productividad', creator: 'DoorManager Pro' });
  const left = 16;
  const right = 194;
  const width = right - left;
  const period = `${date(from)} - ${date(to)}`;
  let y = 31;

  function write(value: string, x: number, baseline: number, size = 10, color = '#24434b', bold = false, align: 'left' | 'right' = 'left') {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(color);
    pdf.text(clean(value), x, baseline, { align });
  }
  function band(label: string) {
    pdf.setFillColor('#163e46');
    pdf.rect(0, 0, 210, 21, 'F');
    write('DOORMANAGER PRO', left, 13, 10, '#ffffff', true);
    write(label, right, 13, 9, '#e0f3ec', false, 'right');
  }
  function room(height: number) {
    if (y + height <= 273) return false;
    pdf.addPage();
    band(period);
    y = 32;
    return true;
  }
  function paragraph(value: string, size = 10) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(size);
    const lines: string[] = pdf.splitTextToSize(clean(value), width);
    for (const line of lines) {
      room(5);
      write(line, left, y, size);
      y += 5;
    }
    y += 3;
  }
  function heading(value: string) {
    room(17);
    write(value, left, y, 14, '#163e46', true);
    y += 9;
  }

  band(saved ? 'ESTUDIO GUARDADO' : 'VISTA PREVIA');
  write('COSTES Y PRODUCTIVIDAD', left, y, 10, '#2c7165', true);
  y += 10;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  for (const line of pdf.splitTextToSize(clean(title.trim() || 'Estudio de costes'), width) as string[]) {
    room(10);
    write(line, left, y, 22, '#163e46', true);
    y += 9;
  }
  paragraph(`Periodo: ${period}${capturedAt ? '  |  Captura: ' + date(capturedAt) : ''}`);

  const cards = [
    ['Coste total estudiado', report.totalCost],
    ['Facturado sin IVA', report.invoiceAmount],
    ['Facturado menos costes', report.invoiceBalance],
  ] as const;
  room(32);
  cards.forEach(([label, value], index) => {
    const cardWidth = (width - 8) / 3;
    const x = left + index * (cardWidth + 4);
    pdf.setFillColor('#eaf4f0');
    pdf.roundedRect(x, y, cardWidth, 23, 3, 3, 'F');
    write(label, x + 4, y + 8, 9, '#2c5b57', true);
    write(money(value), x + 4, y + 17, Math.min(15, 225 / money(value).length), value < 0 ? '#963e3e' : '#163e46', true);
  });
  y += 31;
  paragraph('El saldo del estudio compara facturación y costes del periodo. No representa el beneficio contable.', 9);

  heading('Distribución del coste');
  const costs = [
    ['Personal', report.labourCost, '#2b776b'],
    ['Materiales consumidos', report.materialsCost, '#42938a'],
    ['Recursos', report.resourcesCost, '#527e96'],
    ['Gastos generales', report.overheadCost, '#a97637'],
  ] as const;
  const max = Math.max(1, ...costs.map(([, value]) => value));
  for (const [label, value, color] of costs) {
    room(11);
    write(label, left, y);
    pdf.setFillColor('#edf2f3');
    pdf.roundedRect(76, y - 3.5, 73, 3.5, 1, 1, 'F');
    if (value > 0) {
      pdf.setFillColor(color);
      pdf.rect(76, y - 3.5, 73 * value / max, 3.5, 'F');
    }
    write(money(value), right, y, 10, '#163e46', true, 'right');
    y += 10;
  }
  if (inputs.cost_budget != null && report.budgetDeviation != null) {
    paragraph(`Presupuesto de coste: ${money(inputs.cost_budget)}  |  Desviación: ${money(report.budgetDeviation)}`);
  }
  if (report.missingPayroll || report.missingCosts) {
    paragraph(`Datos incompletos: ${report.missingPayroll} empleados con coste laboral parcial o sin coste completo y ${report.missingCosts} registros de materiales o recursos sin coste.`, 9);
  }
  y += 3;
  room(30);
  heading('Detalle por empleado');
  function tableHeader() {
    pdf.setFillColor('#163e46');
    pdf.roundedRect(left, y - 4, width, 8, 1.5, 1.5, 'F');
    write('Empleado', left + 3, y + 1, 9, '#ffffff', true);
    write('Horas', 108, y + 1, 9, '#ffffff', true, 'right');
    write('Horas directas', 142, y + 1, 9, '#ffffff', true, 'right');
    write('Coste del periodo', right - 3, y + 1, 9, '#ffffff', true, 'right');
    y += 9;
  }
  if (!report.employees.length) paragraph('Sin empleados con datos en el periodo.');
  else tableHeader();
  report.employees.forEach((employee, index) => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    const names: string[] = pdf.splitTextToSize(clean(employee.name), 70);
    const rowHeight = 12 + Math.max(0, names.length - 1) * 4;
    if (room(rowHeight + 8)) tableHeader();
    if (index % 2 === 0) {
      pdf.setFillColor('#f0f6f4');
      pdf.rect(left, y - 5, width, rowHeight, 'F');
    }
    names.forEach((name, line) => write(name, left + 3, y + line * 4, 10, '#163e46', true));
    write(employee.payrollCost == null ? 'Según horas imputadas' : employee.payrollPartial ? 'Coste laboral parcial' : 'Coste laboral completo', left + 3, y + (names.length - 1) * 4 + 5, 8);
    write(number.format(employee.hours), 108, y, 10, '#24434b', false, 'right');
    write(number.format(employee.directHours), 142, y, 10, '#24434b', false, 'right');
    write(money(employee.labourCost), right - 3, y, 10, '#163e46', true, 'right');
    y += rowHeight;
  });
  if (inputs.overheads.length) {
    y += 5;
    heading('Gastos generales adicionales');
    for (const row of inputs.overheads) paragraph(`${row.description || 'Sin descripción'}: ${money(row.amount)}`);
  }
  if (inputs.notes.trim()) {
    y += 5;
    heading('Notas del estudio');
    paragraph(inputs.notes);
  }
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setDrawColor('#c7dcd6');
    pdf.line(left, 281, right, 281);
    write('DoorManager Pro  |  Costes y productividad', left, 287, 8);
    write(`${page} / ${pages}`, right, 287, 8, '#24434b', false, 'right');
  }
  return pdf;
}
