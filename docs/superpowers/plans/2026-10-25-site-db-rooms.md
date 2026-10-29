# Site database rooms implementation plan

> Implement through independent backend and client workers; the owner integrates and verifies the deployment.

**Goal:** Make the existing shared-room UI work on the Site's D1 database.

**Architecture:** Same-origin JSON room API, native D1 transactional batches, capability authorization and polling subscriptions. Preserve the Convex and legacy session adapters.

**Spec:** `docs/superpowers/specs/2026-10-25-site-db-rooms-design.md`

## Tasks

- [ ] Backend: failing SQLite tests, `handleRoomRequest` in `src/runtime/site-rooms.ts`, new `deploy/room-migration.sql`, all six room operations with atomic CAS/history/receipts and authorization.
- [ ] Browser: failing transport/discovery tests, structural room interface, HTTP client, polling cleanup, structured errors and existing Convex compatibility.
- [ ] Integration: failing Worker config/dispatch tests, route room API and trusted caller header, extend SQLite preview with transactional batch and migrations, package new schema.
- [ ] Acceptance: built Worker with real SQLite; two browser contexts create/join/edit/reload/undo and exercise conflict/auth failures. Retain session browser acceptance.
- [ ] Delivery: full repository checks and coverage, independent code/security review, upstream commit/push and Draft PR. Synchronize verified source into the existing personal Site and generate append-only Drizzle migration, build/push/package/deploy. Verify real production room creation/join/update/reload and report URL and PR.

## Review focus

Concurrent writes and identical retries must yield one durable result; failed undo must not partially write; cross-room capabilities must never grant access; config discovery must select D1 in the deployed build; migration history and existing sessions must survive publication.
