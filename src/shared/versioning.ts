export type BuildInfo = {
  version: string;
  commit: string;
  builtAt: string;
};

export type VersionCheckResult =
  | { status: 'current'; current: BuildInfo; latest: BuildInfo }
  | { status: 'update-available'; current: BuildInfo; latest: BuildInfo }
  | { status: 'unavailable'; current: BuildInfo; error: string };

export const currentBuild: BuildInfo = {
  version: typeof __DMP_BUILD_VERSION__ !== 'undefined' ? __DMP_BUILD_VERSION__ : 'test-local',
  commit: typeof __DMP_BUILD_COMMIT__ !== 'undefined' ? __DMP_BUILD_COMMIT__ : 'local',
  builtAt: typeof __DMP_BUILD_TIME__ !== 'undefined' ? __DMP_BUILD_TIME__ : 'test',
};

export async function fetchLatestBuildInfo(fetcher: typeof fetch = fetch): Promise<BuildInfo> {
  const response = await fetcher(`/build-info.json?ts=${Date.now()}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
  if (!response.ok) throw new Error(`No se pudo consultar la versión publicada (${response.status}).`);
  return normalizeBuildInfo(await response.json());
}

export async function checkForNewVersion(current: BuildInfo = currentBuild, fetcher: typeof fetch = fetch): Promise<VersionCheckResult> {
  try {
    const latest = await fetchLatestBuildInfo(fetcher);
    return isNewBuild(current, latest) ? { status: 'update-available', current, latest } : { status: 'current', current, latest };
  } catch (error) {
    return { status: 'unavailable', current, error: error instanceof Error ? error.message : 'No se pudo consultar la versión publicada.' };
  }
}

export function isNewBuild(current: BuildInfo, latest: BuildInfo) {
  return Boolean(latest.version && latest.version !== current.version);
}

export function normalizeBuildInfo(value: unknown): BuildInfo {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    version: text(record.version) ?? 'desconocida',
    commit: text(record.commit) ?? 'desconocido',
    builtAt: text(record.builtAt) ?? 'desconocido',
  };
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
