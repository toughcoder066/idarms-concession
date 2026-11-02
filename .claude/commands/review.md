---
description: Pre-commit review of the current uncommitted changes
---
Run `git status` and `git diff`. Review the changes against the Definition of Done in `CLAUDE.md` section 6: tests present and passing, tenancy tests, contract tests for anything that talks to CROIP, migration reviewed, audit evidence, docs and STATUS updated. Also invoke the `croip-contract-reviewer` and `tenancy-security-reviewer` subagents. List must-fix items first, then suggestions. Do not edit files and do not commit.
