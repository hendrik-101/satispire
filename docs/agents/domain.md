# Domain docs

Satispire uses a single domain context.

## Before exploring

Read `GLOSSARY.md` at the repository root when it exists, then relevant decisions in `docs/adr/`. If either does not yet exist, continue without creating placeholders.

Read the existing documents relevant to the task:

- `docs/architecture.md`: scope and architecture.
- `docs/data-contract.md` and `docs/data/vanilla.md`: catalog data, provenance, and supported production data.
- `docs/geometry-contract.md` and `docs/clocking-contract.md`: logical geometry and clock allocation.
- `docs/collaboration-contract.md` and `docs/mcp.md`: shared commands, authorization, and adapters.
- `docs/design-contract.md`, `docs/local-workspace.md`, and `docs/view-preferences.md`: workspace and presentation.
- `docs/superpowers/specs/` and `docs/superpowers/plans/`: existing feature specifications and plans.

## Vocabulary and decisions

Use the glossary's domain terms consistently in code discussions, tests, and proposals. Resolve a real term before adding it to `GLOSSARY.md`, using `domain-modeling` and its glossary format. Keep implementation details in the contracts and specifications.

Create `docs/adr/` and an ADR only for an actual decision with a meaningful trade-off, future explanatory value, and a material reversal cost. Surface conflicts with existing contracts or ADRs explicitly.

Keep existing contracts, specifications, and plans at their established paths. The glossary and ADRs complement them.
