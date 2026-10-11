# Contributing

Use Node from `.node-version` and npm 11.9.0. Run `npm ci`, then `npm run check` and `npm run test:coverage`. Core modules have no network, browser, database or clock dependency. Add known-answer and negative tests for planner changes.

Open PRs as Draft. Complete Codex code and Security reviews against the current head, resolve valid findings and rerun reviews before Ready. Request CodeRabbit only after Ready. Review unavailability blocks promotion; absent comments do not constitute approval. Merging and deployment require a separately agreed integration step.

UI work requires the selected screenshot and design contract from issue #5. All committed datasets and geometry must declare provenance and redistribution status. Synthetic examples are not evidence of Satisfactory balance or physical buildability.
