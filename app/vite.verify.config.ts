import { defineConfig } from 'vite';
import { builtinModules } from 'module';

/**
 * Bundles the database layer as individual CJS entries so scripts/verify.cjs
 * can require them inside Electron (where better-sqlite3's native ABI matches).
 */
export default defineConfig({
  build: {
    outDir: 'dist-electron/verify',
    emptyOutDir: true,
    ssr: true,
    target: 'node20',
    minify: false,
    rollupOptions: {
      input: {
        sqlite: 'src/database/sqlite.ts',
        'cohort.repository': 'src/database/repositories/cohort.repository.ts',
        'student.repository': 'src/database/repositories/student.repository.ts',
        'contribution.repository': 'src/database/repositories/contribution.repository.ts',
        'refresh-run.repository': 'src/database/repositories/refresh-run.repository.ts',
        'csv.service': 'src/main/services/csv.service.ts',
      },
      external: ['electron', 'better-sqlite3', 'electron-log', ...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
      output: {
        format: 'cjs',
        entryFileNames: '[name].cjs',
        chunkFileNames: '[name].cjs',
        // Keep one file per entry so require() paths in verify.cjs stay stable.
        manualChunks: undefined,
      },
    },
  },
});
