import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/client',
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@shared': '/src/shared',
      '@client': '/src/client',
    },
  },
});
