import type { ReactNode } from 'react';

export type DataTableColumn<Row> = {
  key: string;
  header: ReactNode;
  render: (row: Row) => ReactNode;
  className?: string;
};

export type DataTableProps<Row> = {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  getRowKey: (row: Row) => string;
  rowActions?: (row: Row) => ReactNode;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  pagination?: ReactNode;
  caption?: ReactNode;
  className?: string;
};

/** Compact operational table shell. It owns structure, not domain behavior. */
export function DataTable<Row>({ columns, rows, getRowKey, rowActions, loading = false, emptyTitle = 'Sin registros', emptyDescription = 'No hay datos para este filtro.', pagination, caption = 'Listado de datos', className = '' }: DataTableProps<Row>) {
  return (
    <div className={`table-card data-table ${className}`.trim()} role="region" aria-label="Tabla de datos" tabIndex={0}>
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => <th scope="col" className={column.className} key={column.key}>{column.header}</th>)}
            {rowActions && <th scope="col" className="data-table-actions">Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {loading && <tr><td className="data-table-state" colSpan={columns.length + (rowActions ? 1 : 0)}>Cargando datos...</td></tr>}
          {!loading && !rows.length && <tr><td className="data-table-state" colSpan={columns.length + (rowActions ? 1 : 0)}><strong>{emptyTitle}</strong><span>{emptyDescription}</span></td></tr>}
          {!loading && rows.map((row) => <tr key={getRowKey(row)}>{columns.map((column) => <td className={column.className} key={column.key}>{column.render(row)}</td>)}{rowActions && <td className="data-table-actions"><div className="row-actions">{rowActions(row)}</div></td>}</tr>)}
        </tbody>
      </table>
      {pagination && <div className="data-table-pagination">{pagination}</div>}
    </div>
  );
}
