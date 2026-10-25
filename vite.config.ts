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
  plugins: [
    {
      name: 'public-runtime-config',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url !== '/config.json') return next();
          if (request.method !== 'GET' && request.method !== 'HEAD') {
            response.statusCode = 405;
            response.end();
            return;
          }
          response.setHeader('Content-Type', 'application/json');
          response.setHeader('Cache-Control', 'no-store');
          response.end(
            request.method === 'HEAD'
              ? undefined
              : JSON.stringify({ convexUrl: process.env.CONVEX_URL || null }),
          );
        });
      },
    },
    tanstackStart({ srcDirectory: 'web' }),
    react(),
  ],
});
