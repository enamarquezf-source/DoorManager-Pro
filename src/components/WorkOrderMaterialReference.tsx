import { useState } from 'react';
import { Link } from 'react-router-dom';
import { canAccessRoute } from '../auth/permissions';
import { ModalShell } from './FormPrimitives';

type Props = {
  profile: Parameters<typeof canAccessRoute>[0];
  materialId?: string | null;
  label: string;
  code?: string | null;
  unit?: string | null;
};

export function WorkOrderMaterialReference({ profile, materialId, label, code, unit }: Props) {
  const [open, setOpen] = useState(false);
  if (!materialId) return <>{label}</>;

  const route = '/app/modulos/materiales/' + encodeURIComponent(materialId);
  if (canAccessRoute(profile, route)) return <Link className="work-material-reference" to={route}>{label}</Link>;

  return <>
    <button type="button" className="work-material-reference" aria-haspopup="dialog" onClick={() => setOpen(true)}>{label}</button>
    {open && <ModalShell title={label} onClose={() => setOpen(false)}>
      <dl className="info-grid">
        <div><dt>Material de catálogo</dt><dd>{label}</dd></div>
        {code && <div><dt>Referencia</dt><dd>{code}</dd></div>}
        {unit && <div><dt>Unidad</dt><dd>{unit}</dd></div>}
      </dl>
    </ModalShell>}
  </>;
}
