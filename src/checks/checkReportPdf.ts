export type CheckReport = {
  code: string;
  title: string;
  client: string;
  site: string;
  equipment: {
    name: string;
    code?: string;
    photo?: { data: string; width: number; height: number };
    checks: {
      code: string;
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
    deficiencies?: { code?: string; severity: string; status: string; description?: string; action?: string }[];
  }[];
};

export async function createCheckReportPdf(report: CheckReport) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ compress: true, putOnlyUsedFonts: true });
  const left = 14;
  const right = 196;
  const width = right - left;
  const ink = '#173f47';
  const muted = '#496268';
  const line = '#bdd8d1';
  const pale = '#edf6f3';
  let y = 28;
  let continuation = '';
  pdf.setProperties({ title: `Informe de checks · ${report.code}`, creator: 'DoorManager Pro' });

  function header() {
    pdf.setFillColor(ink);
    pdf.rect(0, 0, 210, 18, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor('#ffffff');
    pdf.setFontSize(10);
    pdf.text('DOORMANAGER PRO', left, 11);
    pdf.text('INFORME DE CHECKS', right, 11, { align: 'right' });
  }

  function reserve(height: number) {
    if (y + height <= 276) return;
    pdf.addPage();
    header();
    y = 28;
    if (continuation) write(`${continuation} (continuación)`, { size: 9, bold: true, color: muted });
  }

  function write(text: string, options: { size?: number; color?: string; bold?: boolean; inset?: number } = {}) {
    const { size = 9, color = ink, bold = false, inset = 0 } = options;
    const lineHeight = size * 0.43;
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    const lines: string[] = pdf.splitTextToSize(text.replace(/[–—‑]/g, '-'), width - 2 * inset);
    for (const textLine of lines) {
      reserve(lineHeight);
      pdf.setFont('helvetica', bold ? 'bold' : 'normal');
      pdf.setFontSize(size);
      pdf.setTextColor(color);
      pdf.text(textLine, left + inset, y);
      y += lineHeight;
    }
  }

  function resultColor(result: string) {
    if (/crític[oa]|no favorable|alta/i.test(result)) return '#963e3e';
    if (/problema leve|media/i.test(result)) return '#815318';
    return /favorable/i.test(result) ? '#246557' : muted;
  }

  function divider() {
    pdf.setDrawColor(line);
    pdf.line(left, y - 1, right, y - 1);
    y += 4;
  }

  header();
  write(report.title || 'Intervención técnica', { size: 17, bold: true });
  write([report.code, report.client, report.site].filter(Boolean).join(' · '), { color: muted });
  const checked = report.equipment.filter(equipment => equipment.checks.length);
  const checkCount = checked.reduce((count, equipment) => count + equipment.checks.length, 0);
  const deficiencyCount = report.equipment.reduce((count, equipment) => count + (equipment.deficiencies?.length ?? 0), 0);
  y += 2;
  write(`${checked.length} ${checked.length === 1 ? 'equipo' : 'equipos'}   ·   ${checkCount} ${checkCount === 1 ? 'check' : 'checks'}   ·   ${deficiencyCount} ${deficiencyCount === 1 ? 'deficiencia registrada' : 'deficiencias registradas'}`, { bold: true });
  if (checked.some(equipment => equipment.checks.some(check => check.local))) {
    write('Incluye resultados de la copia local del dispositivo.', { size: 8, color: muted });
  }
  y += 5;

  for (const [index, equipment] of checked.entries()) {
    continuation = '';
    const photoWidth = 35;
    const photoHeight = 21;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    const nameLines: string[] = pdf.splitTextToSize(equipment.name, width - photoWidth - 14);
    const bandHeight = Math.max(26, 16 + nameLines.length * 5);
    reserve(bandHeight + 13);
    continuation = equipment.name;
    pdf.setFillColor(pale);
    pdf.roundedRect(left, y - 4, width, bandHeight, 2, 2, 'F');
    pdf.setFontSize(8);
    pdf.setTextColor(muted);
    pdf.text(`EQUIPO ${String(index + 1).padStart(2, '0')}`, left + 4, y + 2);
    pdf.setFontSize(12);
    pdf.setTextColor(ink);
    pdf.text(nameLines, left + 4, y + 8, { lineHeightFactor: 1.18 });
    pdf.setFontSize(8);
    pdf.setTextColor(muted);
    pdf.text([equipment.code, `${equipment.checks.length} ${equipment.checks.length === 1 ? 'check' : 'checks'}`].filter(Boolean).join(' · '), left + 4, y + 11 + nameLines.length * 5);

    const photoLeft = right - photoWidth - 4;
    const photoTop = y - 1;
    if (equipment.photo) {
      const { data, width: imageWidth, height: imageHeight } = equipment.photo;
      const scale = Math.min(photoWidth / imageWidth, photoHeight / imageHeight);
      const w = imageWidth * scale;
      const h = imageHeight * scale;
      pdf.addImage(data, 'JPEG', photoLeft + (photoWidth - w) / 2, photoTop + (photoHeight - h) / 2, w, h);
    } else {
      pdf.setDrawColor(line);
      pdf.roundedRect(photoLeft, photoTop, photoWidth, photoHeight, 1, 1);
      pdf.text('Foto no disponible', photoLeft + photoWidth / 2, photoTop + 13, { align: 'center' });
    }
    y += bandHeight + 1;

    for (const check of equipment.checks) {
      continuation = equipment.name;
      reserve(13);
      write(`${check.code}  ·  ${check.result}`, { size: 10, bold: true, color: resultColor(check.result) });
      continuation = `${equipment.name} · ${check.code}`;
      if (check.detail) write(check.detail, { size: 8, color: muted });
      y += 1;
      for (const block of check.blocks) {
        reserve(11);
        write(`${block.name}  ·  ${block.result}`, { bold: true, color: resultColor(block.result), inset: 3 });
        const grouped = new Map<string, string[]>();
        for (const item of block.items) {
          const names = grouped.get(item.result) ?? [];
          names.push(item.note ? `${item.name} (${item.note})` : item.name);
          grouped.set(item.result, names);
        }
        for (const [result, names] of grouped) {
          const namesText = names.join(' · ');
          write(result === block.result ? namesText : `${result}: ${namesText}`, { size: 8, inset: 5 });
        }
        for (const note of block.notes) write(note, { size: 8, color: muted, inset: 5 });
        y += 1;
      }
      y += 2;
    }
    divider();
  }

  const deficiencyGroups = report.equipment.filter(equipment => equipment.deficiencies?.length);
  const deficiencyHeight = deficiencyGroups.reduce((height, equipment) => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    height += pdf.splitTextToSize([equipment.name, equipment.code].filter(Boolean).join(' · '), width).length * 4.73 + 4;
    for (const deficiency of equipment.deficiencies ?? []) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      const details = [deficiency.description, deficiency.action && `Acción recomendada: ${deficiency.action}`].filter((detail): detail is string => Boolean(detail));
      height += 5.87 + details.reduce((lines, detail) => lines + pdf.splitTextToSize(detail, width - 6).length, 0) * 3.87;
    }
    return height;
  }, 14);
  continuation = '';
  reserve(deficiencyHeight <= 245 ? Math.max(16, deficiencyHeight) : 30);
  write('Deficiencias por equipo', { size: 15, bold: true });
  y += 2;
  if (!deficiencyCount) write('No constan deficiencias registradas en este parte.', { color: muted });
  for (const equipment of deficiencyGroups) {
    continuation = 'Deficiencias por equipo';
    reserve(18);
    write([equipment.name, equipment.code].filter(Boolean).join(' · '), { size: 11, bold: true });
    continuation = `Deficiencias · ${equipment.name}`;
    for (const deficiency of equipment.deficiencies ?? []) {
      reserve(10);
      write([deficiency.code, deficiency.severity, deficiency.status].filter(Boolean).join(' · '), { bold: true, color: resultColor(deficiency.severity), inset: 3 });
      if (deficiency.description) write(deficiency.description, { inset: 3 });
      if (deficiency.action) write(`Acción recomendada: ${deficiency.action}`, { color: muted, inset: 3 });
      y += 2;
    }
    divider();
  }

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setDrawColor(line);
    pdf.line(left, 281, right, 281);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(muted);
    pdf.text(`DoorManager Pro · ${report.code}`, left, 287);
    pdf.text(`${page} / ${pages}`, right, 287, { align: 'right' });
  }
  return pdf;
}
