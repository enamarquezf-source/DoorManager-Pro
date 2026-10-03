import type { ReactNode } from 'react';

export function FilterBar({ children, onReset, resetLabel = 'Limpiar filtros', className = '' }: { children: ReactNode; onReset?: () => void; resetLabel?: string; className?: string }) {
  return <div className={`filter-bar toolbar ${className}`.trim()} role="region" aria-label="Filtros de listado">{children}{onReset && <button type="button" className="filter-reset" onClick={onReset}>{resetLabel}</button>}</div>;
}
