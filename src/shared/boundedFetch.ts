// A weak signal must fail in bounded time instead of leaving forms spinning.
export const boundedFetch: typeof fetch = (input, init) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.reject(new TypeError('No hay conexión.'));
  const timeout = AbortSignal.timeout(15_000);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
};
