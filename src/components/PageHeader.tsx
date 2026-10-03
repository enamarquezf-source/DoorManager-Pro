import type { ReactNode } from 'react';

export type PageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  context?: ReactNode;
  actions?: ReactNode;
  metadata?: ReactNode;
  className?: string;
};

/** Shared operational header for list and workspace pages. */
export function PageHeader({ title, subtitle, context, actions, metadata, className = '' }: PageHeaderProps) {
  return (
    <header className={`page-header ${className}`.trim()}>
      <div className="page-header-main">
        {context && <div className="page-header-context">{context}</div>}
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
        {metadata && <div className="page-header-metadata">{metadata}</div>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}

/** Detail variant keeps entity context and status/actions in one compact row. */
export function DetailHeader({ title, subtitle, context = 'Ficha', actions, metadata, className = '' }: PageHeaderProps) {
  return (
    <PageHeader
      title={title}
      subtitle={subtitle}
      context={context}
      actions={actions}
      metadata={metadata}
      className={`detail-header ${className}`.trim()}
    />
  );
}

export function Toolbar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`toolbar ${className}`.trim()}>{children}</div>;
}
