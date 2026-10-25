import { frameAncestors } from './framing.js';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { serve } from 'srvx/node';
import type { Server } from 'srvx';
import { serveStatic } from 'srvx/static';
import { z } from 'zod';

const buildInfo = z
  .object({ revision: z.string().regex(/^[a-f0-9]{40}$/) })
  .strict();
const listener = z.object({
  hostname: z.enum(['127.0.0.1', '0.0.0.0']).default('127.0.0.1'),
  port: z.number().int().min(0).max(65535).default(3000),
});
/** Read-only transport for the existing client-local workspace, not an online backend. */
export async function startHttpRuntime(options: {
  buildDirectory: string;
  hostname?: string;
  port?: number;
  gracefulShutdown?: boolean;
  convexUrl?: string;
}): Promise<Server> {
  const { hostname, port } = listener.parse(options);
  const convexUrl = options.convexUrl || null;
  if (convexUrl) {
    const url = new URL(convexUrl);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      throw new Error('Invalid CONVEX_URL');
  }
  const version = buildInfo.parse(
    JSON.parse(
      await readFile(join(options.buildDirectory, 'build-info.json'), 'utf8'),
    ),
  );
  const clientDirectory = join(options.buildDirectory, 'client');
  const assets = await readdir(join(clientDirectory, 'assets'));
  if (
    !assets.some((file) => file.endsWith('.js')) ||
    !assets.some((file) => file.endsWith('.css'))
  )
    throw new Error('Incomplete client build');
  const module = await import(
    pathToFileURL(join(options.buildDirectory, 'server/server.js')).href
  );
  const entry = module.default as
    | { fetch?: (request: Request) => Response | Promise<Response> }
    | undefined;
  if (typeof entry?.fetch !== 'function')
    throw new Error('Invalid server build');
  const staticFiles = serveStatic({ dir: clientDirectory });
  const server = serve({
    hostname,
    port,
    silent: true,
    trustProxy: false,
    gracefulShutdown:
      options.gracefulShutdown === false ? false : { gracefulTimeout: 5 },
    maxRequestBodySize: 65536,
    error: (error) => {
      console.error('Satispire HTTP request failed', error);
      return new Response('Internal Server Error', { status: 500 });
    },
    async fetch(request) {
      if (request.method !== 'GET' && request.method !== 'HEAD')
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { Allow: 'GET, HEAD' },
        });
      const path = new URL(request.url).pathname;
      const headers = {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      };
      if (path === '/config.json')
        return Response.json({ convexUrl }, { headers });
      if (path === '/healthz')
        return Response.json({ status: 'ok' }, { headers });
      if (path === '/version.json') return Response.json(version, { headers });
      if (path.startsWith('/assets/')) {
        // Avoid srvx's uncached, per-request Brotli/gzip work on the small test service.
        const assetHeaders = new Headers(request.headers);
        assetHeaders.delete('accept-encoding');
        return staticFiles(
          new Request(request.url, {
            method: request.method,
            headers: assetHeaders,
            signal: request.signal,
          }),
          () => new Response('Not Found', { status: 404 }),
        );
      }
      // A native Request avoids adapter-specific cloning behavior in the SSR handler.
      const rendered = await entry!.fetch!(
        new Request(request.url, {
          method: request.method,
          headers: request.headers,
          signal: request.signal,
        }),
      );
      const renderedHeaders = new Headers(rendered.headers);
      renderedHeaders.set('Content-Security-Policy', frameAncestors);
      return new Response(rendered.body, {
        status: rendered.status,
        statusText: rendered.statusText,
        headers: renderedHeaders,
      });
    },
  });
  await server.ready();
  return server;
}
