import { useState } from 'react';
import { Download } from 'lucide-react';
import { buildFunctionalCheckBlocks } from '../checks/checkBlocks';
import { checkResultLabel } from '../checks/resultPresentation';
import { checkEquipmentName } from '../shared/equipmentPresentation';
import { formatDate, fullName } from '../shared/labels';

export function CheckReportDownload({ work }: { work: any }) {
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
      const pdf = await createCheckReportPdf({
        code: work.code ?? 'Parte',
        title: work.title ?? '',
        client: work.clients?.legal_name ?? '',
        site: work.sites?.name ?? '',
        checks: checks.map((check: any) => {
          const itemResults = new Map<string, any>((check.check_item_results ?? []).map((item: any) => [item.item_id, item]));
          return {
            heading: [checkEquipmentName(check.equipment, check.check_templates?.equipment_types?.name), check.code].filter(Boolean).join(' · ') || 'Check',
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
          };
        }),
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
