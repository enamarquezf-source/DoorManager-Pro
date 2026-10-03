import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export type KpiPriority = 'primary' | 'secondary' | 'supporting';

export function KpiBlock({ label, value, context, status = 'info', priority = 'secondary', action, loading = false, error }: {
  label: string;
  value: ReactNode;
  context?: ReactNode;
  status?: string;
  priority?: KpiPriority;
  action?: string;
  loading?: boolean;
  error?: string;
}) {
  const content = error
    ? <p className="kpi-error" role="alert">{error}</p>
    : loading
      ? <p className="kpi-loading" role="status">Cargando…</p>
      : <><strong>{value}</strong>{context && <small>{context}</small>}</>;
  const body = <><span className="kpi-label">{label}</span>{content}</>;
  return action
    ? <Link className={`kpi-block kpi-${priority} kpi-${status}`} to={action}>{body}</Link>
    : <div className={`kpi-block kpi-${priority} kpi-${status}`}>{body}</div>;
}
