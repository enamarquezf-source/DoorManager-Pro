import { offlineWorkerSource } from './src/offline/workerSource';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

function offlineShellPlugin() {
  return {
    name: 'dmp-offline-shell',
    apply: 'build' as const,
    generateBundle: {
      order: 'post' as const,
      handler(this: any, _options: any, bundle: Record<string, any>) {
        const publicFiles = (directory: string, prefix = ''): string[] => readdirSync(directory, { withFileTypes: true }).filter(entry => !entry.name.startsWith('_') && !entry.name.startsWith('.')).flatMap(entry => entry.isDirectory() ? publicFiles(join(directory, entry.name), `${prefix}${entry.name}/`) : [`/${prefix}${entry.name}`]);
        const files = [...new Set(['/index.html', ...Object.keys(bundle).filter(name => !name.endsWith('.map')).map(name => `/${name}`), ...publicFiles('public')])];
        const cache = `dmp-shell-${Date.now()}`;
        this.emitFile({ type: 'asset', fileName: 'sw.js', source: offlineWorkerSource(cache, files) });
      },
    },
  };
}

const buildTime = new Date().toISOString();
const buildCommit = process.env.CF_PAGES_COMMIT_SHA ?? process.env.GITHUB_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'local';
const buildIdentity = buildCommit === 'local' ? buildTime.replace(/\D/g, '') : buildCommit.slice(0, 12);
const buildVersion = `${process.env.npm_package_version ?? '0.0.0'}-${buildIdentity}`;

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
  plugins: [react(), buildInfoPlugin(), offlineShellPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) return 'react';
          if (id.includes('node_modules/@supabase')) return 'supabase';
          if (id.includes('node_modules/lucide-react')) return 'icons';
        },
      },
    },
  },
  define: {
    __DMP_BUILD_VERSION__: JSON.stringify(buildVersion),
    __DMP_BUILD_COMMIT__: JSON.stringify(buildCommit),
    __DMP_BUILD_TIME__: JSON.stringify(buildTime),
  },
});
