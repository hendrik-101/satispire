# Runtime image archive verification

Base main: 530227223f7a905cb01cb53302166136db7a9782. Main CI38308506495 was green, but its artifact endpoint returned total_count0. Existing workflow permission is contents:read; no packages-write or registry publication is available in that workflow.

The actual new artifact regression ran against the old exporter first: full container smoke passed, then reading bundle/manifest.json failed ENOENT. Evidence: /tmp/satispire-artifact-red.log in the Cloud execution workspace.

Verification commands for the new candidate:

- npm run check and npm run test:coverage retain all existing units/build/type/lint/adapter checks.
- APP_REVISION=<actual HEAD> BUILDX_CONFIG=/tmp/satispire-artifact-buildx npm run test:artifact validates wrong-revision and dirty-checkout refusal, saved/loaded actual image, full inherited container checks, identity/commit binding, all bundle checksums and rejection after a deliberate disposable archive corruption.
- APP_REVISION=<actual HEAD> npm run build:runtime; npm run test:runtime; npm run test:browser:runtime retain actual compiled production HTTP and all inherited browser checks.
- PR CI on ubuntu-latest exports and uploads a candidate bundle using the unchanged contents:read permissions. Upload success is the concrete repository-permission probe. PR bundles are not Main releases; final Main artifacts require a successful main push after merge.

Run results, final candidate commit and exact external review links belong in the PR description. Existing actual runtime desktop/mobile screenshots remain in http-runtime-desktop.png and http-runtime-mobile.png; this change alters no UI.

No registry push, package-permission setting, additional credential, VPS runner, DNS/tunnel/security change or deployment is performed. Registry transport remains separately gated; the download/load path uses the verified image configuration ID with the never-pull Compose overlay.
