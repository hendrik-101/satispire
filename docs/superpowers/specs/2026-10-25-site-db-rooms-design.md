# Shared rooms on the Site database

The deployed home page uses the shared-room interface, but its client currently requires Convex while the existing Site supplies D1. The user selected the existing Site database as the backend. Preserve room creation, reusable links, complete plans, revision checks, immutable paginated history and compensating undo. Keep the existing session API and data available.

Use the existing Worker/D1 binding with separate room tables and same-origin POST endpoints. Advertise the transport through `/api/room-config`; the browser uses a structural room-client interface and polls authenticated snapshots. Explicitly configured Convex deployments continue to work. A new external Convex deployment and redirecting users to the older session UI would not meet the selected approach.

Atomic D1 batches must commit the plan, revision, receipt and history together. Store secret digests only, scope every operation to a verified room membership, preserve stable public error codes, and retain existing per-caller creation limits and bounded input validation. Schema additions must be append-only; no existing plans or migration records are replaced. No new external service or credential is needed.

Verify with real SQLite transactional tests and a built-Worker browser test using two independent contexts without mocked transport. Cover create, share/join, updates, reload, history/undo, direct room routing and the existing session flow. After code/security review, publish the fixed source to the existing Site, preserve its audience and test the actual production room flow. Deliver an upstream Draft PR without merging it.
