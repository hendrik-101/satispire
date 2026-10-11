# Verification evidence

The exact candidate and remote check/review URLs are recorded in PR #13. Claims apply to the identified revision, not to a later working tree or a complete product release.

## Initial executable slice

- At `7f4d3bd`, GitHub push and pull-request CI succeeded. The workflow installed from the lockfile, checked format/lint/types, ran coverage and Chromium adapter tests, audited dependencies, built TypeScript and executed compiled CLI/MCP smoke tests.
- Local independent correctness review of `21e4797` found a compiled ESM startup failure and internal fractions incorrectly hitting external input limits. The runtime fix is `7f4d3bd`; canonical rational repair is `959e4c3`. Regression tests exercise tiny rates, catalog normalization idempotence, generated fractions and actual compiled entry points.
- At `959e4c3`, local unit/domain/Convex/adapter tests: 195 passed. Coverage: 95.91% lines, 88.55% branches. Format, lint, strict types, build, compiled smoke and two browser adapter tests passed. Dependency audit found no known vulnerabilities with the committed lockfile.
- In a disposable archive of `959e4c3`, a deliberately false assertion failed the test command; an unimported 400-statement production module was included in coverage and failed thresholds. Both probes were removed and the full snapshot coverage gate passed. No probe remains in product code.

`convex-test` executes registered functions in a simulated backend, not a provisioned service. WebMCP browser tests emulate the early-preview API and check real application calls/fallback; no native AI-client compatibility is claimed. The pure view-state tests and final remote reports are attached to their later candidate in the PR.

## Coverage boundaries

Coverage explicitly includes all `src/**/*.ts` and `convex/**/*.ts`. CLI/stdio process entrypoints are excluded from line coverage because subprocess execution is instead checked by compiled smoke and actual stdio client tests. The Convex schema declaration is validated by Convex integration tests and excluded from executable-line thresholds. Generated deployment code does not exist in this slice.

The supplementary local security review of the initial candidate reported no confirmed P1/P2 findings. The actual GitHub Draft reviews completed on `b58700c`: Security Review reported no security issues; Code Review reported three P2 findings (recipe-map key bounds, retryable WebMCP cleanup and CLI limits before allocation). These were repaired in `025d8ea`; 253 tests, two Chromium browser tests, coverage and remote CI passed. The repeated Security Review reported no issues on `025d8ea`; Code Review identified three input-contract mismatches (recipe-map entry count, catalog ID length and target count). The subsequent candidate aligns production limits and checks catalog IDs through room commands and generated layout bindings. PR #13 records current candidate reviews and CI; earlier reviews do not certify a later HEAD.

Absence of a response never authorizes Ready. CodeRabbit may only run after a successful Ready transition. Nothing here grants merge permission.
