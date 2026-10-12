import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  build: { outDir: 'web-dist' },
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    watch: { usePolling: true, interval: 500 },
  },
  plugins: [tanstackStart({ srcDirectory: 'web' }), react()],
});
