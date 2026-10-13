# Satispire test runtime and Netcup handoff

This delivery runs the existing client-local workspace. It does not deploy Convex, online rooms or a remote MCP server. Classic MCP stays stdio; WebMCP stays feature-detected in the browser. Plans remain client-side and exportable. No VPS/DNS/tunnel/credential changes or registry push are performed by these files. Runtime PR16 was squash-merged as 5302272 after successful gates; publication changes remain a separate follow-up.

## Local production start

Node 24.19.0 and build npm 11.9.0 are pinned. The existing locked `srvx` 0.11.22 adapter bridges the built TanStack Fetch handler to Node HTTP and serves generated `/assets/` files. [TanStack server entry](https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point), [srvx lifecycle](https://srvx.h3.dev/guide/server).

```sh
npm ci
APP_REVISION=$(git rev-parse HEAD) npm run build:runtime
HOST=127.0.0.1 PORT=3000 npm start
```

`HOST` permits only `127.0.0.1` or `0.0.0.0`; its default is loopback. `PORT` is an integer from 1 to 65535, default 3000. GET/HEAD `/healthz` returns `{ "status": "ok" }`; `/version.json` returns the immutable build revision, both uncached. The revision is the supplied full lowercase commit SHA baked into `web-dist/build-info.json`; setting an environment revision at startup cannot relabel it. Start fails before listening for malformed/missing metadata, missing server code, or incomplete JS/CSS assets. Assets are trusted generated build output, with no runtime uploads or writable asset mount. POST and other write methods return 405; adding real server functions requires a separate transport decision. Forwarded URL headers are ignored. Node error details are not returned to clients; exceptions are recorded in the private rotated container logs for operators. Assets use identity encoding: the runtime strips Accept-Encoding before static serving so it cannot launch uncached per-request Brotli/gzip work. Edge compression or precompressed assets are separate operator/build choices. SIGTERM drains for at most five seconds before closing active connections.

`npm run test:runtime` checks actual compiled SSR, linked JS/CSS, health/identity, write refusal and signal shutdown. `npm run test:browser:runtime` repeats the complete existing Chromium suite through the production listener on loopback 4175; it is not Vite preview. `APP_REVISION=$(git rev-parse HEAD) npm run test:container` builds and exercises one disposable local image/container, then removes exactly those test resources. It refuses non-Unix Docker endpoints. A restricted executor may set `BUILDX_CONFIG` to a writable temporary directory. When its existing `NODE_EXTRA_CA_CERTS` is provided, the smoke passes that build-only CA as a temporary BuildKit secret to npm; TLS validation remains enabled and the CA is absent from the runtime image. No broad Docker cleanup runs.

## Immutable container

`Dockerfile` uses the verified Node 24.19.0 Bookworm image digest; build/dependency stages install npm 11.9.0. Its strict source-file allowlist excludes Git, local data, env/credentials, tests and dependency folders. An actual builder-stage regression creates disposable root/nested env sentinels and verifies neither entered the context. The final image contains only production dependencies, compiled runtime, web output and the existing SatisfactoryTools numeric-data copyright/license notice. It runs UID 1000, Node directly as PID 1 and the builtin Node health probe; `wget` is not installed or required.

Build a release only from a clean checkout of the accepted commit. `APP_REVISION` must match that checkout; the argument is build provenance, not an attestation that Docker independently verified Git. Record the accepted source SHA, OCI revision label, resulting image ID and published registry digest together. Publish only after separate authorization; a local build does not provide a GHCR digest.

```sh
git diff --quiet
git diff --cached --quiet
test -z "$(git ls-files --others --exclude-standard)"
revision=$(git rev-parse HEAD)
docker build --build-arg APP_REVISION="$revision" -t "satispire:test-$revision" .
```

## GitHub CI image archive (no registry write)

CI runs only on GitHub-hosted `ubuntu-latest`. After the inherited checks, it saves the image by configuration ID, removes its disposable tag, loads the archive and exercises the full container smoke on the loaded image. Only a successful **main push** job uploads `satispire-runtime-<event>-<full SHA>` with pinned upload-artifact v4.6.2. Existing `contents: read` is unchanged; no packages, id-token or other write permission is added. A seven-day retention bounds storage; download an accepted bundle before expiration and retain the previous known-good bundle for rollback. Artifact deletion/expiration makes its link unavailable; this is not a permanent registry or release.

The bundle contains `image.tar`, `manifest.json`, `SHA256SUMS`, both Compose files and this deployment contract. Manifest v1 records repository, checked-out revision/tree, image configuration digest, platform, archive checksum and CI event/ref/run/attempt. The job summary adds the upload artifact URL and ZIP digest. These are separate digests: image ID is not a registry manifest digest, inner tar checksum is not the artifact ZIP digest. Manifest metadata and checksums prove consistency; they are not an independent signed attestation or proof of source provenance without the authenticated successful CI run. Pinned build inputs make rebuilds repeatable; byte-identical Docker archives are not promised.

For production acceptance, independently verify the GitHub run is successful, is a **push to main** in `hendrik-101/satispire`, and has the accepted full SHA. Require manifest `kind: main`, matching revision, source tree, repository and run/attempt. **PR (`candidate`) and local bundles are for review only**, even if their tests pass. The PR flow checks export/load locally on the hosted runner but does not upload any new archive. Actual upload permissions are only exercised by an authorized later main push; this preparation does not prove that upload has already succeeded. Existing main `5302272` had no stored artifact: after this change is merged, the new successful main push produces a bundle for that new accepted commit. It does not retrospectively label that bundle as `5302272`.

Download only the authenticated expected GitHub artifact, compare its ZIP SHA-256 with the recorded upload digest, and extract it to a fresh staging directory. Before Docker load, run `sha256sum -c SHA256SUMS` there, compare manifest fields with the run and approved commit, and check its platform matches the target host. Checksums supplied by an untrusted archive alone do not establish trust. After those checks:

```sh
docker load --input image.tar
# Use the manifest's exact sha256:<configuration digest> as SATISPIRE_IMAGE.
# Verify docker image inspect <ID> reports that ID and the accepted OCI revision.
# Infrastructure supplies verified SATISPIRE_HOST_PORT and CLOUDFLARED_WEB_NETWORK.
docker compose -f compose.test.yml -f compose.artifact.yml config
docker compose -f compose.test.yml -f compose.artifact.yml up -d --wait --wait-timeout 90
```

The artifact overlay enforces `pull_policy: never`; it never asks a registry for the configuration ID. The base template accepts either the approved loaded `sha256:<ID>` with this overlay or an approved registry reference with manifest digest. Preserve all existing loopback/resource/privilege restrictions and run the same HTTP identity, assets and public HTTPS/browser acceptance below. Rollback loads the retained previous verified archive and applies its exact ID and rendered Compose files. No remote rollout, automatic upload to a registry, secrets, DNS or tunnel changes are performed by CI.

GHCR is an optional later transport. Before adding a push, obtain explicit approval to give a **main-only publication job** `packages: write` and verify its `GITHUB_TOKEN` can write the Satispire package namespace, together with the infrastructure owner's read access. Existing app/tool access and `contents: read` do not establish those package rights. No new PAT is required by the proposed GitHub-token route. Publish only the accepted main image, record its registry digest and verify its configuration/OCI revision against this manifest; then use the base registry Compose path. Those rights, package mapping and publication authorization remain unverified and are not activated here.

## Netcup application contract

The existing [Pizza interface](https://github.com/hendrik-101/netcup-vps-docker/blob/master/stacks/pizza/README.md) already uses exact image/revision inputs, Compose readiness, loopback, an external `cloudflared-web` network and previous-image rollback. Satispire supplies `deploy/compose.test.yml` (plus `deploy/compose.artifact.yml` for verified loaded archives) for the same ownership boundary. It is an application template, not a silently installed infrastructure playbook.

The Netcup owner must wire a narrowly scoped Satispire playbook/controller to these inputs:

- `satispire_revision`: accepted 40-character lowercase source SHA.
- Registry transport `satispire_image`: published `ghcr.io/hendrik-101/satispire@sha256:<64 lowercase hex>` digest for that SHA; verify image label and HTTP identity agree. Reject mutable tags or unverified revision mappings.
- Archive transport `satispire_image`: verified loaded `sha256:<configuration ID>` and the never-pull overlay described above.
- A newly verified free IPv4 loopback port, mapped to container port 3000. No port availability is assumed.
- The already-existing tunnel network and selected test hostname; no network creation, hostname or DNS changes are implicit.
- Private existing inventory/SSH host-key verification and temporary registry authentication handled by infrastructure, kept out of the app environment/logs and removed on success/failure.

The template requires `SATISPIRE_IMAGE`, `SATISPIRE_HOST_PORT` and `CLOUDFLARED_WEB_NETWORK`, publishes only `127.0.0.1`, and aliases the service `satispire-test-app:3000`. It has no persistent application volumes; root is read-only, capabilities dropped, no-new-privileges, bounded tmpfs/memory/CPU/PIDs and rotated logs. Readiness comes from the image healthcheck. The verified 512-MiB test cap is a tested artifact constraint, not a current VPS capacity assessment.

After separately approved deployment: preflight current host capacity/port/network, preserve previous exact digest/revision and rendered config, pull the accepted digest, render/review Compose, then `docker compose -f deploy/compose.test.yml up -d --wait --wait-timeout 90`. Check loopback `/healthz`, exact `/version.json`, root and JS/CSS; check the selected HTTPS hostname through Cloudflare and actual desktop/mobile planning. Tunnel target is `http://satispire-test-app:3000`, supplied to the existing tunnel operator. Local acceptance does not prove that external route.

On failure, report failure and retain diagnostic identity/config. Rollback explicitly reapplies the previous known-good digest/config with the same wait and HTTP/browser checks. There is no automatic rollback, pruning, database migration, volume replacement, secret rotation or touching other application stacks. Retain known-good images until rollback is verified.

## Squash integration without replaying ancestors

The user prefers squash. Pinned sources are PR13 `484d9fb5fd8e6aef7f47061a83b0dd364b6d4d6c`, PR14 `4eb8817e509c98f610d86f72754653a9128b823b`, PR15 `2bf67694986d053be740d9cbbcd66826aa832727`. Independent scratch-clone rehearsal applied each `git diff --binary --full-index old-parent child-head` net patch and committed it once; `git apply --check --index`, `git write-tree` equality and `git diff --exit-code pinned-head HEAD` passed at every stage.

After explicit integration permission: squash PR13 to main, recreate PR14 on that resulting main using only the pinned PR13→PR14 net patch, verify its staged/final tree equals PR14, squash it, then recreate PR15 using only PR14→PR15 and verify exact equality. Apply this runtime follow-up likewise using PR15→its accepted final head. Use scratch integration branches first. Preserve old heads and remote-head leases; any authorized update to an existing child branch uses `--force-with-lease=<branch>:<recorded-old-sha>`, never blind force, followed by retargeting/diff inspection and actual new-head CI. The recipe was rehearsed independently, then PR13–15 were integrated after explicit authorization; see the [runtime QA record](qa/http-runtime-2026-10-12.md) for exact commits and tree checks. Runtime PR16 was subsequently squash-merged as 5302272, preserving the reviewed tree and passing Main CI and an actual compiled HTTP smoke. Preserve review links and tree-equivalence evidence; do not trigger another manual review solely for an unchanged file tree.

PR15 contains base-repair merge commits 622740b, 6f61628 and 636affb. A naive ordinary rebase/cherry-pick can drop their resolutions or replay repairs already included in the squash base. The net patch preserves the final intended child difference. If main gains unrelated changes, exact pinned-tree equality no longer proves safe integration: stop and reconcile explicitly rather than discarding those changes.
