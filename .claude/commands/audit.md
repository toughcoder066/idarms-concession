---
description: Read-only audit of what is built vs the CROIP contract; fills docs/STATUS.md
argument-hint: "[optional: one service or area to audit]"
---
Audit this repository against `CLAUDE.md` and `docs/context/02-croip-integration-contract.md`. Scope: $ARGUMENTS (if empty, the whole repo).

**Phase focus:** audit in depth only the "Phase 1: Connect, Register, Receive" rows in `docs/STATUS.md` (see `docs/context/04-phase1-connect-register-receive.md`). For billing, payments and reporting, record only what exists (files, tables, routes) and mark the rows `DEFERRED`. Do not assess their quality yet.

Rules for this task: **do not change any source code, migration or config.** The only file you may edit is `docs/STATUS.md`, and you may append to `docs/OPEN_QUESTIONS.md`.

0. **Recover intent and history first.** Read `git log` (use `git log --stat --date=short` and sample the oldest, the largest and the most recent commits), open branches (`git branch -a`) and any tags. Read every README, `docs/`, `ADR`/`decisions`, `CHANGELOG`, TODO/FIXME comments, issue or PR templates, and any older design notes in the repo. From these, write a short **"Intent and history"** section in `docs/STATUS.md`: what the owner was evidently trying to build, in what order it was built, which areas look abandoned or half-finished, and where documented intent and the actual code disagree. Label every statement as *documented* (cite file or commit) or *inferred* (say from what). Do not treat a commit message as proof that something works.
1. Map the repo: services, ports, databases, workers, shared packages, docker-compose, CI. List each service's owned tables and its routes (read the code, not just READMEs).
2. For every row in `docs/STATUS.md`, decide a status with **evidence** (file path + what you saw, or the command you ran and its output). Run `npm run typecheck` and `npm test` per service where possible and record results. If something cannot be run, say why.
3. Specifically test the assumptions in ADR-0001. Does any service treat ratepayers or properties as locally authoritative (writes them from API routes, owns their IDs, validates them as the primary record)? Mark those `WRONG MODEL` and list the exact files.
4. Check the non-negotiables from `CLAUDE.md` section 4: tenant context from token only, transactional outbox, stable event IDs, integer minor units, append-only corrections, idempotent consumers, no cross-service DB access. Report each violation with file and line.
5. Compare the existing code with the placement suggested in contract section 7 (a CROIP adapter). Report where it already differs; do not refactor.
6. Fill the "Findings from audit" section, ordered by risk (money correctness, tenancy leaks, data ownership, then everything else).
7. Propose an ordered list of next slices in "Next slices", each small enough to finish and verify in one session, with the open questions each depends on.

Finish with a 10-line summary: what is solid, what is wrong, what is missing, and the first slice you recommend. Do not start implementing it.
