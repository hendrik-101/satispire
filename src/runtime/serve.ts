import { fileURLToPath } from 'node:url';
import { startHttpRuntime } from './http.js';
try {
  const value = process.env.PORT ?? '3000';
  if (!/^[0-9]+$/.test(value) || Number(value) < 1 || Number(value) > 65535)
    throw new Error('Invalid PORT');
  const server = await startHttpRuntime({
    buildDirectory: fileURLToPath(new URL('../../web-dist/', import.meta.url)),
    hostname: process.env.HOST ?? '127.0.0.1',
    ...(process.env.CONVEX_URL ? { convexUrl: process.env.CONVEX_URL } : {}),
    port: Number(value),
  });
  console.log(`Satispire listening on ${server.url}`);
} catch {
  console.error(
    'Satispire startup failed: verify HOST/PORT and the complete revision-bound build.',
  );
  process.exitCode = 1;
}
