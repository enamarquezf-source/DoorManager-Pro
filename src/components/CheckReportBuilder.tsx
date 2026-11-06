import { useEffect, useState, type FormEvent } from 'react';
import { Download } from 'lucide-react';
import { downloadCheckReport } from '../checks/downloadCheckReport';
import { checksService } from '../services/checksService';
import { maintenanceService, type MaintenanceContract } from '../services/maintenanceService';
import { workOrdersService, type WorkOrderFullDetail } from '../services/workOrdersService';
import { checkEquipmentName } from '../shared/equipmentPresentation';
import { displayStatus } from '../shared/labels';
import { normalizeParam } from '../shared/filters';
import { ModalShell } from './FormPrimitives';
import './check-report-builder.css';

type Source = 'part' | 'maintenance' | 'manual';

const sources: { id: Source; label: string }[] = [
  { id: 'part', label: 'De un parte' },
  { id: 'maintenance', label: 'De un mantenimiento' },
  { id: 'manual', label: 'Selección manual' },
];

export function CheckReportBuilder({ onClose }: { onClose: () => void }) {
  const [source, setSource] = useState<Source>('part');
  const [catalog, setCatalog] = useState<any[] | null>(null);
  const [contracts, setContracts] = useState<MaintenanceContract[] | null>(null);
  const [id, setId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loadingError, setLoadingError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    const request = source === 'maintenance' ? maintenanceService.list() : checksService.reportCatalog();
    void request.then(rows => {
      if (!current) return;
      if (source === 'maintenance') setContracts(rows);
      else setCatalog(rows);
    }).catch(() => {
      if (current) setLoadingError('No se ha podido cargar la lista. Vuelve a intentarlo.');
    });
    return () => { current = false; };
  }, [source]);

  const parts = new Map<string, any>();
  for (const check of catalog ?? []) {
    if (check.work_orders) parts.set(check.work_orders.id, check.work_orders);
  }
  const options = source === 'maintenance'
    ? (contracts ?? []).map(contract => ({ id: contract.id, label: [contract.code, contract.title, contract.client?.legal_name].filter(Boolean).join(' · ') }))
    : [...parts.values()].map(part => ({ id: part.id, label: [part.code, part.title, part.clients?.legal_name].filter(Boolean).join(' · ') }));
  const visibleChecks = (catalog ?? []).filter(check => {
    const label = [check.code, checkEquipmentName(check.equipment), check.equipment?.code, check.work_orders?.code, check.work_orders?.clients?.legal_name].filter(Boolean).join(' ');
    return normalizeParam(label).includes(normalizeParam(search));
  });
  const loading = source === 'maintenance' ? !contracts : !catalog;

  async function generate(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      let report;
      if (source === 'part') {
        report = await workOrdersService.getWorkOrderFullDetail(id);
      } else if (source === 'maintenance') {
        const contract = contracts?.find(row => row.id === id);
        if (!contract) throw new Error('Selecciona un mantenimiento.');
        const visitIds = [...new Set<string>(contract.visits.map(visit => visit.work_order?.id).filter(Boolean))];
        const visits: WorkOrderFullDetail[] = [];
        for (const visitId of visitIds) visits.push(await workOrdersService.getWorkOrderFullDetail(visitId));
        report = {
          id: contract.id,
          code: contract.code ?? 'Mantenimiento',
          title: contract.title,
          clients: contract.client,
          sites: contract.site,
          checks: visits.flatMap(visit => visit.checks.map(check => ({ ...check, reportPartCode: visit.code }))),
          deficiencies: visits.flatMap(visit => visit.deficiencies),
        };
      } else {
        const checks: Awaited<ReturnType<typeof checksService.get>>[] = [];
        for (let offset = 0; offset < selected.length; offset += 8) {
          checks.push(...await Promise.all(selected.slice(offset, offset + 8).map(checkId => checksService.get(checkId))));
        }
        report = {
          code: 'Selección manual',
          title: 'Informe de checks seleccionados',
          checks,
          deficiencies: checks.flatMap(check => check.deficiencies ?? []),
        };
      }
      const checks = (report.checks ?? []).filter((check: any) => !check.deleted_at);
      if (!checks.length) throw new Error('La selección no tiene checks para incluir en el informe.');
      await downloadCheckReport(report, false, checks);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se ha podido generar el informe.');
    } finally {
      setBusy(false);
    }
  }

  return <ModalShell title="Crear informe de checks" onClose={onClose} canClose={!busy}>
    <form className="check-report-builder" onSubmit={generate}>
      <fieldset disabled={busy}>
        <legend>Origen de los checks</legend>
        <div className="check-report-sources">
          {sources.map(option => <label key={option.id}>
            <input type="radio" name="report-source" checked={source === option.id} onChange={() => {
              setId('');
              setLoadingError('');
              setError('');
              setSource(option.id);
            }} />
            {option.label}
          </label>)}
        </div>
      </fieldset>
      {loadingError && <p role="alert" className="form-error">{loadingError}</p>}
      {loading && !loadingError && <p role="status">Cargando opciones…</p>}
      {!loading && source !== 'manual' && <label>
        {source === 'maintenance' ? 'Mantenimiento' : 'Parte'}
        <select value={id} onChange={event => setId(event.target.value)} disabled={busy} required>
          <option value="">{options.length ? 'Seleccionar…' : 'Sin opciones disponibles'}</option>
          {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
        {source === 'maintenance' && <small>Incluye los checks de los partes vinculados a sus visitas.</small>}
      </label>}
      {!loading && source === 'manual' && <>
        <label>Buscar checks<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Código, equipo, parte o cliente" disabled={busy} /></label>
        <p role="status">{selected.length} {selected.length === 1 ? 'check seleccionado' : 'checks seleccionados'}</p>
        <div className="check-report-options" aria-label="Checks disponibles">
          {!visibleChecks.length && <p>No hay checks que coincidan con la búsqueda.</p>}
          {visibleChecks.map(check => <label key={check.id}>
            <input type="checkbox" checked={selected.includes(check.id)} disabled={busy} onChange={event => {
              const checked = event.target.checked;
              setSelected(current => checked ? [...current, check.id] : current.filter(checkId => checkId !== check.id));
            }} />
            <span>
              <strong>{check.code} · {checkEquipmentName(check.equipment)}</strong>
              <small>{[displayStatus(check.status), check.work_orders?.code, check.work_orders?.clients?.legal_name].filter(Boolean).join(' · ')}</small>
            </span>
          </label>)}
        </div>
      </>}
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="actions">
        <button type="button" onClick={onClose} disabled={busy}>Cancelar</button>
        <button type="submit" className="primary" disabled={busy || loading || Boolean(loadingError) || (source === 'manual' ? !selected.length : !id)}>
          <Download size={16} aria-hidden="true" /> {busy ? 'Preparando informe…' : 'Descargar PDF'}
        </button>
      </div>
    </form>
  </ModalShell>;
}
