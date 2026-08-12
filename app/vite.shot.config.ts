/**
 * Build config for the screenshot harness (src/main/shot.ts).
 * Emits into dist-electron/main so its relative ../preload and ../../dist
 * paths resolve exactly as they do for the real main process.
 */
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'node20',
    lib: { entry: 'src/main/shot.ts', formats: ['cjs'], fileName: () => 'shot.cjs' },
    outDir: 'dist-electron/main',
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      external: ['electron', 'electron-log', 'better-sqlite3', 'path', 'fs', 'os', 'crypto', 'util'],
    },
  },
});
