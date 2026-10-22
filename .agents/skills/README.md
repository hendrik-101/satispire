# Matt Pocock skills for Satispire

Original skills by [Matt Pocock](https://github.com/mattpocock), from [mattpocock/skills](https://github.com/mattpocock/skills/tree/5beb35b040e3de97e54fa9e386d7e42d15c295c2) at revision `5beb35b040e3de97e54fa9e386d7e42d15c295c2`.

Licensed under MIT, copyright (c) 2026 Matt Pocock. The complete upstream license is preserved in [LICENSE.matt-pocock](LICENSE.matt-pocock).
Original skill and reference files are preserved unchanged. [manifest.json](manifest.json) records every original file's source path and Git blob hash.

## Installed selection

| Skill                                                                   | Purpose                                                                |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [domain-modeling](domain-modeling/SKILL.md)                             | Resolve domain terminology and capture glossary entries and decisions. |
| [codebase-design](codebase-design/SKILL.md)                             | Design module interfaces and testable seams.                           |
| [improve-codebase-architecture](improve-codebase-architecture/SKILL.md) | User-requested architecture survey and candidate report.               |
| [prototype](prototype/SKILL.md)                                         | Explore a concrete UI or logic question with a throwaway prototype.    |
| [setup-matt-pocock-skills](setup-matt-pocock-skills/SKILL.md)           | Configure issue tracking and domain documentation for this repository. |
| [grilling](grilling/SKILL.md)                                           | Supporting interview skill required by the architecture survey.        |

Installed project-locally under `.agents/skills/`, the standard Codex project skill directory. No global plugin or second copy was installed. A new Codex session may be needed to refresh the skill picker; existing sessions can read the files directly.

Installing a skill does not execute its workflow. In particular, no architecture refactor or prototype is implied by installation.

## Updating

This is a pinned local installation and does not update automatically. Review an upstream revision before replacing files, preserve its license, and update the source revision and file hashes in `manifest.json`. Copy each selected skill's complete directory, including references and `agents/openai.yaml`, and include any newly required supporting skills. Avoid installing the full plugin alongside this copy, which would duplicate skills.

Repository formatting excludes the unchanged upstream skill files; format the local README and manifest normally.
