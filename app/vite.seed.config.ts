/**
 * Build config for the seed/verification harness (src/main/seed.ts).
 * Bundles the real production modules into a CJS entry Electron can run.
 */
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'node20',
    lib: { entry: 'src/main/seed.ts', formats: ['cjs'], fileName: () => 'seed.cjs' },
    outDir: 'dist-electron/seed',
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      external: ['electron', 'electron-log', 'better-sqlite3', 'path', 'fs', 'os', 'crypto', 'util'],
    },
  },
});
