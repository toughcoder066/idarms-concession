---
description: Check a file, module or diff against the CROIP contract and hard rules
argument-hint: "<path, module, or 'diff'>"
---
Review $ARGUMENTS (use `git diff` if it says "diff") against `CLAUDE.md` section 4 and `docs/context/02-croip-integration-contract.md`.

Use the `croip-contract-reviewer` and `tenancy-security-reviewer` subagents in parallel, then merge their findings. Report only concrete violations, each with file:line, the rule broken (quote it), and the smallest fix. Separate "must fix" from "open question". Do not edit files.
