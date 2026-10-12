# HTTP Runtime Implementation Plan

> Execute inline with superpowers:executing-plans. One writer, independent read-only squash scout and final external reviews.

Goal: runnable tested HTTP/Container artifact for the existing client-local Satispire planner.
Architecture: the existing built TanStack Fetch handler runs behind the existing locked srvx Node adapter; a narrow asset/health/version wrapper defines the deployment contract.
Tech Stack: Node 24.19.0, npm 11.9.0, TypeScript, srvx 0.11.22, existing Zod/Vitest/Playwright and local Docker.
Spec: ../specs/2026-10-12-http-runtime.md

## Global constraints

No merge, branch rewrite, VPS/DNS/tunnel/credential changes, paid service or new UI work. No CodeRabbit gate. Preserve PR13–15. Runtime is GET/HEAD only and does not expose online collaboration.

## Review focus

Static path escape/incorrect MIME; untrusted forwarded headers; build readiness/revision identity; unsafe public port/container authority; shutdown/error leakage.

## Task 1: Runtime

Files: src/runtime/http.ts, serve.ts, healthcheck.ts; scripts/write-build-info.mjs; tests/http-runtime.test.ts; package scripts/dependency and CI.
Interfaces: startHttpRuntime({buildDirectory,hostname?,port?,gracefulShutdown?}) -> srvx Server; npm run build:runtime reads APP_REVISION (40 lowercase hex); npm start serves the compiled app with HOST/PORT.

- [x] Write real HTTP tests with a disposable built-handler fixture and observe RED.
- [x] Implement wrapper, strict metadata/settings and process entrypoints; observe GREEN.
- [x] Build actual app and run compiled HTTP smoke, inherited Chromium and gates.

## Task 2: Container and deployment handoff

Files: Dockerfile, .dockerignore, deploy/compose.test.yml, docs/deployment.md; scripts/runtime-smoke.mjs and container-smoke.mjs; CI.
Interfaces: APP_REVISION build argument -> fixed /version.json revision; port 3000 inside image; externally supplied SATISPIRE_IMAGE digest, SATISPIRE_HOST_PORT and CLOUDFLARED_WEB_NETWORK.

- [x] Implement isolated image/health probe and required-variable Compose contract.
- [x] Prove actual local non-root/read-only container health, assets/planning, identity and shutdown; record any environment blockers honestly.
- [x] Document Netcup owner acceptance/rollback and scout-proven squash net-patch recipe.
- [ ] Publish separate Draft PR on PR15; run current-head CI and external normal/Security reviews/fixes. Do not merge/deploy.

Ruling: existing user instructions explicitly authorize Cloud implementation and a small runtime/deployment artifact, with sole writer and isolated Draft PR. Continue inline without renewing design/plan execution approval; live integration/deployment remains withheld.

Ruling: the user later authorized Squash integration of PR13–15 only. Main is 3ee83ed, with reviewed-tree equality and fresh CI/reviews before each merge; final main passes 326 units/45 browsers. Runtime is rebased unchanged onto that main, and remains a separate unmerged follow-up. Build-only executor CA uses a transient secret without weakening TLS. A real context privacy regression required stricter source-file inclusion.
