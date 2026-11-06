export type CheckReport = {
  code: string;
  title: string;
  client: string;
  site: string;
  checks: {
    heading: string;
    result: string;
    detail: string;
    local: boolean;
    blocks: {
      name: string;
      result: string;
      notes: string[];
      items: { name: string; result: string; note?: string }[];
    }[];
  }[];
};

export async function createCheckReportPdf(report: CheckReport) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ compress: true, putOnlyUsedFonts: true });
  const margin = 16;
  const width = 178;
  let y = 34;
  const ink = '#173f47';
  const muted = '#496268';
  pdf.setProperties({ title: `Informe de checks · ${report.code}`, creator: 'DoorManager Pro' });

  function header() {
    pdf.setFillColor(ink);
    pdf.rect(0, 0, 210, 21, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor('#ffffff');
    pdf.setFontSize(10);
    pdf.text('DOORMANAGER PRO', margin, 13);
    pdf.text('INFORME DE CHECKS', 194, 13, { align: 'right' });
  }
  function reserve(height: number) {
    if (y + height <= 273) return;
    pdf.addPage();
    header();
    y = 34;
  }
  function write(text: string, options: { size?: number; color?: string; bold?: boolean; inset?: number } = {}) {
    const { size = 10, color = ink, bold = false, inset = 0 } = options;
    const lineHeight = size * 0.44;
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    const lines: string[] = pdf.splitTextToSize(text.replace(/[–—‑]/g, '-'), width - inset);
    for (const line of lines) {
      reserve(lineHeight);
      pdf.setTextColor(color);
      pdf.text(line, margin + inset, y);
      y += lineHeight;
    }
  }
  const resultColor = (result: string) => /crítico|no favorable/i.test(result) ? '#963e3e'
    : result === 'Problema leve' ? '#815318' : muted;

  header();
  write(report.code, { bold: true, color: '#2c7165' });
  y += 3;
  write(report.title || 'Intervención técnica', { size: 20, bold: true });
  write([report.client, report.site].filter(Boolean).join(' · '), { color: muted });
  y += 4;
  const count = report.checks.length;
  write(`${count} ${count === 1 ? 'check finalizado' : 'checks finalizados'}`, { size: 12, bold: true });
  if (report.checks.some(check => check.local)) write('Incluye resultados de la copia local del dispositivo.', { size: 9, color: muted });
  y += 6;
  for (const check of report.checks) {
    reserve(30);
    pdf.setDrawColor('#bdd8d1');
    pdf.line(margin, y - 4, 194, y - 4);
    write(check.heading, { size: 14, bold: true });
    write(check.result, { bold: true, color: resultColor(check.result) });
    if (check.detail) write(check.detail, { size: 9, color: muted });
    y += 4;
    for (const block of check.blocks) {
      reserve(15);
      write(`${block.name} · ${block.result}`, { bold: true, color: resultColor(block.result) });
      for (const note of block.notes) write(note, { size: 9, color: muted, inset: 3 });
      for (const item of block.items) {
        reserve(10);
        write(`${item.name} · ${item.result}`, { size: 9, color: resultColor(item.result), inset: 3 });
        if (item.note) write(item.note, { size: 9, color: muted, inset: 6 });
      }
      y += 4;
    }
    y += 6;
  }
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setDrawColor('#bdd8d1');
    pdf.line(margin, 281, 194, 281);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(muted);
    pdf.text('DoorManager Pro · Informe de intervención', margin, 287);
    pdf.text(`${page} / ${pages}`, 194, 287, { align: 'right' });
  }
  return pdf;
}
