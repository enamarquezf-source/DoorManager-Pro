import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const buildTime = new Date().toISOString();
const buildCommit = process.env.CF_PAGES_COMMIT_SHA ?? process.env.GITHUB_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'local';
const buildVersion = `${process.env.npm_package_version ?? '0.0.0'}-${buildCommit.slice(0, 12)}`;

function buildInfoPlugin() {
  return {
    name: 'dmp-build-info',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'build-info.json',
        source: JSON.stringify({ version: buildVersion, commit: buildCommit, builtAt: buildTime }, null, 2),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), buildInfoPlugin()],
  define: {
    __DMP_BUILD_VERSION__: JSON.stringify(buildVersion),
    __DMP_BUILD_COMMIT__: JSON.stringify(buildCommit),
    __DMP_BUILD_TIME__: JSON.stringify(buildTime),
  },
});
