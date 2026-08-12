/**
 * Vite build config for the Electron preload script.
 * Outputs a CJS bundle to dist-electron/preload/index.cjs
 */
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/preload/index.ts',
      formats: ['cjs'],
      fileName: () => 'index.cjs',
    },
    outDir: 'dist-electron/preload',
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    rollupOptions: { external: ['electron'] },
  },
});
