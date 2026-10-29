# Satispire agent guide

Read `CONTRIBUTING.md` before changing code; it defines checks, attribution, Draft reviews, and integration requirements. Read `docs/architecture.md` for scope and `docs/design-contract.md` for UI work.

## Delivery

For repository changes, commit and push the work and create or update a Draft pull request by default, unless the user explicitly asks otherwise. Include the PR link in the final response. Do not stop after local edits or successful checks. Merge and deployment still require separate authorization.

## Reviews

Use Codex code and Security reviews against the current head, together with the required CI checks. CodeRabbit is not used in this project: do not install it, authenticate it, request reviews or retry its integration. Its availability is not a review or merge gate. This policy supersedes CodeRabbit instructions in older plans, specifications and verification notes; those remain historical records.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `hendrik-101/satispire`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single context: `GLOSSARY.md` and `docs/adr/`. Read relevant existing contracts too. See `docs/agents/domain.md`.

### Installed skills

Matt Pocock's selected skills are in `.agents/skills/<name>/SKILL.md`: `domain-modeling`, `codebase-design`, `improve-codebase-architecture`, `prototype`, and `setup-matt-pocock-skills`. `grilling` is their supporting interview skill. Read the matching skill before applying it; load supporting references only as needed.

Use `domain-modeling` when resolving terminology, and `codebase-design` when designing module interfaces. Run `improve-codebase-architecture` and `setup-matt-pocock-skills` only on explicit user request. Use `prototype` for a concrete design question, respecting the existing UI contract.

For an overlapping task, choose one primary workflow rather than running both Matt Pocock and Superpowers orchestration. Keep existing specs and plans in `docs/superpowers/`; new decisions go in `docs/adr/` only when justified.

Source, license, revision, and update instructions: `.agents/skills/README.md`.
