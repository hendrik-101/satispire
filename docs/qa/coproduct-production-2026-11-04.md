# Coproduct production verification

The change adds exact balances for all outputs of reachable selected recipes, one machine group per executed recipe, reuse of coproducts, and explicit surplus outlets. It preserves the previous single-output JSON representation. No external code, datasets, dependencies or geometry were added.

Known answers exercised through solver, layout and saved-session validation:

- 20 rubber + 20 plastic + 40 fuel per minute use 120 crude oil and three refineries, leaving 30 heavy oil residue and 30 polymer resin.
- 20 rubber + 10 residual fuel use 30 crude oil, transfer 15 heavy oil residue to the fuel stage, and leave 5 residue.
- Net-zero imported water can recycle between stages or within one stage without an external water graph node.

The production view, inspector, graph and schematic distinguish stage identity from output material. Import and profile updates preserve validated active coproduct recipe aliases. Tests cover purified quartz across import, calculation, profile application and export.

Independent code and security reviews found and resolved cumulative solver work cost, masked manufactured feedback cycles, a greedy allocation false rejection, active recipe alias loss, same-stage synthetic lift handling and delimiter collisions. An additional regression preserves legacy connection ordering. The final allocator was independently checked against 2,000 generated known-feasible DAGs with permutation invariance; an independent exact vertex audit covered 1,000 two-variable balance problems.

Both exact balancing and activation-order allocation have cumulative work bounds. Complex manufactured-material feedback remains explicitly unsupported; raw-material recycling is supported. Neither surplus outlets nor logical routes certify an automatically operating in-game disposal setup or physical buildability.

Validation commands and final results are recorded in the pull request. The first simultaneous coverage/check/browser run exceeded existing timeouts in `sessions.test.ts` (retained retries) and `belt-scene.test.ts` (all side combinations); coverage is verified separately to avoid that resource contention.

`npm audit --audit-level=high` exits successfully. Its report contains 21 moderate dependency findings with no available fix; this change does not alter the lockfile. External current-head GitHub reviews and CI remain requirements before promoting the Draft; local independent reviews do not substitute for those service-side reviews. Merge and deployment are separate steps.
