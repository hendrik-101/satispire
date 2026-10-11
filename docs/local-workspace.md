# Local workspace

Use Node 24.19.0 / npm 11.9.0. On Hendrik's PC, use the existing WSL Ubuntu-24.04 runtime and canonical checkout:

```sh
. /home/hendr/.local/satispire-runtime/activate.sh
cd /mnt/c/Users/hendr/git/satispire
npm ci
npm run dev
```

Open http://127.0.0.1:4173 on the PC. Vite listens only on loopback; polling supports changes written from Windows into this WSL checkout. Use Linux npm for this checkout. Do not alternate Windows and Linux dependency installs. Native Windows cannot run the POSIX bounded-file tests/import CLI; Chromium browser checks can use installed Windows Chrome.

The initial example uses original synthetic recipes and geometry. Choose demand and a recipe in the inspector, then apply with **Plan berechnen**. Invalid input preserves the last valid plan. Etagen, Produktion and Verknüpft are personal view presets; panels, selection and zoom are separate from production intent. Only personal view preferences are persisted in localStorage. Plan export saves the current production input and catalog version, without a catalog or personal preferences. Import needs the matching active catalog; the editor changes the first target and preserves additional imported targets when recalculating.

## Private discovery import

Select exactly manifest.json, items.json, recipes.json and buildings.json from the user's local discovery directory. All conversion happens in the browser. There is no upload, catalog persistence, hosted backend or automatic game-file discovery. The files are limited to 8 MB each and 24 MB combined. Numeric fields from the discovery normalizer are already parsed JavaScript numbers; subsequent arithmetic is rational but cannot recover precision lost before conversion.

The original normalizer and its synthetic checks are in scripts/discovery. The converter checks the discovery schema, explicit raw resource classes, recipe references, producer identity and manufacturing speed. Eligible manufacturers become separate recipe choices. Unsupported or unresolved recipe records appear in the exclusions list. Alternate/event/unlock metadata is retained as provenance, not confirmation of the user's current save. Coproduct and cyclic choices remain unsupported by the production solver and produce diagnostics.

CLI conversion requires POSIX file safety support:

```sh
npm run import:discovery -- /absolute/private/discovery /absolute/private/catalog.json
npm run plan -- --input /absolute/private/production.json --catalog /absolute/private/catalog.json
```

Use fresh destinations; existing catalog/diagnostic files are preserved. A diagnostics sidecar records exclusions. Keep all game data, private outputs, icons and meshes outside Git. The full catalog's redistribution status is unresolved.

## Honest geometry and operation

Imported game data has no verified physical machine footprints or ports. The center shows a logical production stage and explicitly unknown geometry; it never substitutes synthetic geometry for a real machine. The graph draws actual item-input edges and exact rates, including branching. Optional flow indicators are illustrative, disabled by default, bounded to small selected connections and paused for hidden tabs/reduced motion.

This slice runs locally without Convex credentials. Online collaboration, authentication/deployment, verified clock modifiers, verified game geometry and a public deployment remain separate work. Existing Convex/core/MCP functions are preserved. No VPS production service, mount, port or security setting is changed by this UI branch.

## Verification

Run npm run check, npm run test:coverage and npm run test:browser. Browser cases cover planning/error recovery, local discovery import with no POST, saved personal layout and narrow keyboard operation; adapter tests remain separate. Production web output is web-dist and compiled CLI output is dist.
