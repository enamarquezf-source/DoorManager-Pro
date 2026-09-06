import { QueryClient } from '@tanstack/react-query';
import { queryDefaults } from './queryDefaults';

export const queryClient = new QueryClient({
  defaultOptions: { queries: queryDefaults },
});
