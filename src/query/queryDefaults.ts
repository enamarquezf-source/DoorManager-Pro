export const queryDefaults = {
  staleTime: 30_000,
  gcTime: 10 * 60_000,
  retry: 1,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
};

export const catalogStaleTime = {
  long: 10 * 60_000,
  medium: 2 * 60_000,
};
