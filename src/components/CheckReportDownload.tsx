import { useState } from 'react';
import { Download } from 'lucide-react';
import { buildFunctionalCheckBlocks } from '../checks/checkBlocks';
import { checkResultLabel } from '../checks/resultPresentation';
import { checkEquipmentName } from '../shared/equipmentPresentation';
import { displayStatus, formatDate, fullName } from '../shared/labels';
import { equipmentPhotosService } from '../services/equipmentPhotosService';
import { technicianWorkspaceService } from '../services/technicianWorkspaceService';
import type { CheckReport } from '../checks/checkReportPdf';

async function reportPhoto(equipmentId: string, offline: boolean) {
  try {
    const photos = await (offline ? technicianWorkspaceService.photos(equipmentId) : equipmentPhotosService.listPrimary(equipmentId));
    const url = photos[0]?.signed_url;
    if (!url) return undefined;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return undefined;
    const bitmap = await createImageBitmap(await response.blob());
    try {
      const scale = Math.min(1, 420 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) return undefined;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return { data: canvas.toDataURL('image/jpeg', 0.76), width: canvas.width, height: canvas.height };
    } finally {
      bitmap.close();
    }
  } catch {
    return undefined;
  }
}

export function CheckReportDownload({ work, offline = false }: { work: any; offline?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const checks = (work.checks ?? []).filter((check: any) => !check.deleted_at && check.status === 'Realizado');
  if (!checks.length) return null;

  async function download() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { createCheckReportPdf } = await import('../checks/checkReportPdf');
      const equipment = new Map<string, CheckReport['equipment'][number]>();
      for (const check of checks) {
        const equipmentId = check.equipment_id ?? check.equipment?.id;
        const key = equipmentId ?? check.id;
        let group = equipment.get(key);
        if (!group) {
          group = {
            name: checkEquipmentName(check.equipment, check.check_templates?.equipment_types?.name),
            code: check.equipment?.code,
            checks: [],
          };
          equipment.set(key, group);
        }
        const itemResults = new Map<string, any>((check.check_item_results ?? []).map((item: any) => [item.item_id, item]));
        group.checks.push({
          code: check.code ?? 'Check',
          result: checkResultLabel(check.global_result, check.check_section_results),
          detail: [check.finished_at ? formatDate(check.finished_at) : '', check.profiles ? fullName(check.profiles) : ''].filter(Boolean).join(' · '),
          local: Boolean(check._local || check.check_section_results?.some((row: any) => row._local)),
          blocks: buildFunctionalCheckBlocks(check).map(block => ({
            name: block.name,
            result: checkResultLabel(block.result?.result, block.result ? [block.result] : []),
            notes: [block.result?.observations, block.result?.intervention && `Intervención: ${block.result.intervention}`].filter(Boolean),
            items: block.items.map(item => {
              const row = itemResults.get(item.id);
              return {
                name: [item.component, item.title !== item.component ? item.title : ''].filter(Boolean).join(' · ') || 'Comprobación',
                result: checkResultLabel(row?.result, [{ result: row?.result, severity: block.result?.severity }]),
                note: row?.observations,
              };
            }),
          })),
        });
      }
      const equipmentIds = new Set<string>(checks.map((check: any) => check.equipment_id ?? check.equipment?.id).filter(Boolean));
      const equipmentByCheck = new Map<string, string>(checks.map((check: any) => [check.id, check.equipment_id ?? check.equipment?.id ?? check.id]));
      for (const deficiency of work.deficiencies ?? []) {
        if (deficiency.deleted_at) continue;
        const id = deficiency.equipment_id ?? deficiency.equipment?.id;
        const key = id ?? equipmentByCheck.get(deficiency.check_id) ?? 'unassigned';
        let group = equipment.get(key);
        if (!group) {
          group = { name: checkEquipmentName(deficiency.equipment), code: deficiency.equipment?.code, checks: [] };
          equipment.set(key, group);
        }
        (group.deficiencies ??= []).push({
          code: deficiency.code,
          severity: displayStatus(deficiency.severity),
          status: displayStatus(deficiency.status),
          description: deficiency.description,
          action: deficiency.recommended_action,
        });
      }
      await Promise.all([...equipmentIds].map(async id => {
        const group = equipment.get(id);
        if (group) group.photo = await reportPhoto(id, offline && !navigator.onLine);
      }));
      const pdf = await createCheckReportPdf({
        code: work.code ?? 'Parte',
        title: work.title ?? '',
        client: work.clients?.legal_name ?? '',
        site: work.sites?.name ?? '',
        equipment: [...equipment.values()],
      });
      pdf.save(`DMP-checks-${String(work.code ?? work.id).replace(/[^a-z0-9_-]/gi, '-')}.pdf`);
    } catch {
      setError('No se ha podido descargar el informe de checks. Vuelve a intentarlo.');
    } finally {
      setBusy(false);
    }
  }

  return <div>
    <button type="button" className="link-button" onClick={() => void download()} disabled={busy}><Download size={16} aria-hidden="true" /> {busy ? 'Preparando informe…' : 'Descargar informe de checks'}</button>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
