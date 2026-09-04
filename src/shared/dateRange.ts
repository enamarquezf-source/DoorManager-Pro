export type DateRangeFilters = {
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
};

function localDateBoundary(value: string, end: boolean) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day + (end ? 1 : 0)).toISOString();
}

export function applyDateRangeFilters<T extends { gte: (column: string, value: string) => T; lt: (column: string, value: string) => T }>(query: T, filters: DateRangeFilters) {
  let next = query;
  if (filters.createdFrom) next = next.gte('created_at', localDateBoundary(filters.createdFrom, false));
  if (filters.createdTo) next = next.lt('created_at', localDateBoundary(filters.createdTo, true));
  if (filters.updatedFrom) next = next.gte('updated_at', localDateBoundary(filters.updatedFrom, false));
  if (filters.updatedTo) next = next.lt('updated_at', localDateBoundary(filters.updatedTo, true));
  return next;
}
