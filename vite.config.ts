import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/client',
  publicDir: '../../pkg',
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    rollupOptions: {
      external: ['/lunar_physics_wasm.js'],
    },
  },
  resolve: {
    alias: {
      '@shared': '/src/shared',
      '@client': '/src/client',
    },
  },
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['lunar_physics_wasm'],
  },
});
