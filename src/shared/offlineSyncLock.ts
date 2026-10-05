// All tabs on this origin share this lock. Do not steal a live request's lock.
const lockName = 'dmp-technician-offline-sync';
let ownsLock = false;

export async function withOfflineSyncLock<T>(task: () => Promise<T>, busy: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) return task();
  return navigator.locks.request(lockName, { ifAvailable: true }, async (lock) => {
    if (!lock) return busy();
    ownsLock = true;
    try { return await task(); }
    finally { ownsLock = false; }
  });
}

export async function withOfflineRecoveryLock<T>(task: () => Promise<T>, busy: () => Promise<T>): Promise<T> {
  // Sync invokes recovery while already holding the lock in this context.
  return ownsLock ? task() : withOfflineSyncLock(task, busy);
}
