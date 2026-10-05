export async function completeConceptChanges<T>(lines: T[], save: (line: T) => Promise<unknown>) {
  const results = await Promise.allSettled(lines.map((line) => Promise.resolve().then(() => save(line))));
  return results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
}
