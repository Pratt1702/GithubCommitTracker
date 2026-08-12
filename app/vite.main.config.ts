/**
 * Vite build config for the Electron main process.
 * Outputs a CJS bundle to dist-electron/main/index.cjs
 */
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'node20',
    lib: {
      entry: 'src/main/index.ts',
      formats: ['cjs'],
      fileName: () => 'index.cjs',
    },
    outDir: 'dist-electron/main',
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    rollupOptions: {
      external: [
        'electron',
        'electron-log',
        'better-sqlite3',
        'path',
        'url',
        'fs',
        'fs/promises',
        'os',
        'https',
        'http',
        'crypto',
        'events',
        'stream',
        'util',
        'net',
        'zlib',
      ],
    },
  },
});
