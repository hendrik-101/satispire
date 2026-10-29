# Issue tracker: GitHub

Issues and specs live in [hendrik-101/satispire](https://github.com/hendrik-101/satispire/issues).
Use the connected GitHub tools when available. Otherwise use `gh` from this checkout with `--repo hendrik-101/satispire`.

## Conventions

- Read: `gh issue view <number> --repo hendrik-101/satispire --json number,title,body,labels,comments`.
- List: `gh issue list --repo hendrik-101/satispire --state open --json number,title,labels`.
- Publish an approved spec: create an issue with its exact body using a structured connector argument or `gh issue create --repo hendrik-101/satispire --title "..." --body-file <path>`.
- Fetch the relevant ticket: read the referenced issue and its linked specifications.
- Use native sub-issues and dependency links when supported; otherwise write `Part of #<parent>` and `Blocked by: #<number>` in issue bodies.
- Creating, editing, commenting on, or closing issues requires authorization from the current user task; configuring this tracker alone does not authorize those actions.

**PRs as a request surface: no.**

`triage` is not installed; no triage labels are configured or created.

## Project review policy

Follow `CONTRIBUTING.md`: PRs start as Draft. Complete Codex code and Security reviews on the current head before Ready. CodeRabbit is not used or requested for this project. Merge and deployment require a separately agreed integration step.
