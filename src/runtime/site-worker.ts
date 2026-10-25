import { frameAncestors } from './framing.js';
import { handleSessionRequest, type SessionDatabase } from './site-sessions.js';
export interface SiteAsset {
  body: string;
  contentType: string;
}
/** Assets are build-time immutable data. Request state and plan storage stay in D1. */
export function createSitesWorker(assets: Readonly<Record<string, SiteAsset>>) {
  return {
    async fetch(
      request: Request,
      env: { DB: SessionDatabase },
    ): Promise<Response> {
      const path = new URL(request.url).pathname;
      const headers = {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': frameAncestors,
      };
      if (path.startsWith('/api/sessions/')) {
        if (!env.DB)
          return Response.json(
            { error: { code: 'storage-unavailable' } },
            { status: 503, headers },
          );
        // Cloudflare supplies this header at the Worker edge; request JSON never chooses the caller.
        const caller = request.headers.get('CF-Connecting-IP');
        return handleSessionRequest(request, env.DB, caller || undefined);
      }
      if (request.method !== 'GET' && request.method !== 'HEAD')
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { ...headers, Allow: 'GET, HEAD' },
        });
      if (path === '/api/session-config')
        return Response.json({ transport: 'http' }, { headers });
      const asset = Object.hasOwn(assets, path) ? assets[path] : undefined;
      if (!asset) return new Response('Not Found', { status: 404, headers });
      return new Response(request.method === 'HEAD' ? null : asset.body, {
        headers: {
          ...headers,
          'Content-Type': asset.contentType,
          'Cache-Control': path.startsWith('/assets/')
            ? 'public, max-age=31536000, immutable'
            : 'no-store',
        },
      });
    },
  };
}
