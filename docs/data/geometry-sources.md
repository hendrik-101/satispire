# Machine geometry sources and reuse permission

## Current application state

The previously added Deetss/satisfactory-planner measurements, lookup, layout field and inspector display were removed on 18 October 2026 because no explicit reuse permission had been established. User acceptance and attribution did not establish source permission. That dataset is not bundled. Its replacement is independently generated from the licensed source below, with separate building bounds, clearance and ports. Satisfactory 1.2 is the project target.

## Active licensed replacement: Satisfactory AI

Attribution: **Aadit Sachdev**, [AaditS22/satisfactory-ai](https://github.com/AaditS22/satisfactory-ai). Copyright (c) 2026 Aadit Sachdev.

The repository's [MIT License at revision 4ad031efd3631d67676af087035aef8ed32a3b93](https://github.com/AaditS22/satisfactory-ai/blob/4ad031efd3631d67676af087035aef8ed32a3b93/LICENSE) explicitly permits use, modification and redistribution while retaining its copyright and permission notice. The complete unchanged [license text](SatisfactoryAI-LICENSE.txt) is retained here. No narrower data-specific notice was found in the inspected catalog, extraction script or repository README. This is the license evidence for this candidate, independent of the existing SatisfactoryTools recipe license.

Pinned source files:

- [data/catalog.json](https://github.com/AaditS22/satisfactory-ai/blob/4ad031efd3631d67676af087035aef8ed32a3b93/data/catalog.json): numeric building bounds, clearance boxes, and conveyor connection positions/directions in building-local metres.
- [executor/catalog.py](https://github.com/AaditS22/satisfactory-ai/blob/4ad031efd3631d67676af087035aef8ed32a3b93/executor/catalog.py): the author's measurement procedure. It spawns each building in game at yaw zero, records bounds/clearance/ports and then clears the temporary building. This script was inspected, not executed.
- [README.md](https://github.com/AaditS22/satisfactory-ai/blob/4ad031efd3631d67676af087035aef8ed32a3b93/README.md): project scope, Satisfactory 1.2 prerequisite and MIT declaration.

The catalog declares `satai.catalog`, version 1, with source `executor.catalog: each building spawned in-game at yaw 0, building-local metres`. It covers five of Satispire's eleven production machines: Smelter, Constructor, Assembler, Manufacturer and Foundry. It also includes splitters, mergers, storage, foundations, a lift and miners. It does not supply the remaining six production machines: Blender, Converter, Particle Accelerator, Refinery, Packager or Quantum Encoder.

The catalog has no exact game build identifier. Its README declares a 1.2 prerequisite; geometry provenance therefore records `gameVersion: "1.2"` and `gameBuild: null`, distinct from the recipe source's explicit 1.2.4.0 / CL 502094 evidence. The five production-machine records are imported as `src/data/machine-geometry.ts`, bound to the active 1.2 catalog. Unsupported machines and other catalog versions return null. No exact-build geometry verification is claimed.

The source distinguishes rendered building bounds, hard placement clearance, soft clearance and port positions. The imported metadata retains bounds minima/maxima and the source's measured size, hard-clearance minima/maxima and derived size, and local port positions/directions. It does not import the individual soft-clearance boxes or establish collision rules. A hard-clearance height is not necessarily the visible machine's full height; the inspector displays the two sets separately. Port coordinates remain source-local metadata, not routed schematic endpoints. The source rounds values to three decimal places, so rounded min/max subtraction can differ from its independently rounded size by a millimetre.

The MIT notice and author attribution are retained in documentation, the inspector's license section, browser output and runtime-image `licenses/`. Meshes, textures and game artwork are excluded. Satisfactory is developed by Coffee Stain Studios; no license to its artwork is asserted.

## Other inspected candidates

- [ludvenhq/factory-board](https://github.com/ludvenhq/factory-board/blob/c9cd7059b9efd39e45611d95cd2f21ebf4e8811b/packages/game-data/src/demo.ts), copyright (c) 2026 Vladislav Gapchinsky: its game-data package has an explicit [MIT license](https://github.com/ludvenhq/factory-board/blob/c9cd7059b9efd39e45611d95cd2f21ebf4e8811b/packages/game-data/LICENSE). Its hand-written demo declares that it is not copied from the game files and includes two-dimensional footprints for four production machines. It has no complete height/port dataset and is not imported here.
- [SgtEpsilon/Satisfactory-Planner](https://github.com/SgtEpsilon/Satisfactory-Planner/blob/c5ea91dca1b8d70c03e605ed82ba32158b7eeffa/satisfactory-planner/src/data/machines.ts) has a root MIT license, but its dimension table explicitly names Satisfactory Calculator/SCIM as its source. [SCIM's source notice](https://github.com/AnthorNet/SC-InteractiveMap#license) prohibits reuse of its code and data assets. The downstream MIT label does not resolve that upstream restriction; none of its dimensions is imported.

The inspection establishes available license notices and source coverage. It does not independently verify measurements in a running copy of Satisfactory.
