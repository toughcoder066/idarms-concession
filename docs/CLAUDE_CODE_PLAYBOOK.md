# Claude Code playbook for finishing iDARMS

For the owner, not for Claude. Follow the parts in order. Each prompt below is meant to be pasted as-is.

## Part 1: Install the pack (10 minutes)

From your iDARMS repository root, with the pack unzipped somewhere else:

```bash
git status                                  # must be clean. Commit or stash first.
git switch -c chore/claude-code-onboarding
git tag pre-claude-code                     # your undo point
cp -rn /path/to/idarms-pack/. .             # -n never overwrites; check nothing was skipped
ls CLAUDE.md .claude docs/context           # confirm
git add -A && git commit -m "chore: add Claude Code context, contract and commands"
```

If you already have a `CLAUDE.md`, a `.claude/` folder or a `docs/` folder, `cp -n` leaves your files alone. Merge by hand and keep the ownership table, the hard rules and the `@docs/...` imports at the bottom of `CLAUDE.md`.

Then:
1. Keep the repository **private**. `docs/source/` holds draft Government-review material.
2. Add `CLAUDE.local.md` to `.gitignore` (it is for your private notes) and never put secrets in any `.md` file.
3. Start Claude Code **from the repo root**. Do not run `/init`; you already have a CLAUDE.md.
4. Run `/permissions` once and read it. The pack allows type-checks, tests and read-only git, asks before commits, installs, migrations, `docker compose up/down` and `curl`, and denies `.env` reads, `down -v`, `migrate reset`, `db push`, force-push and `rm -rf`.

## Part 2: Habits that matter most when you are new

- **One task per session.** When a slice is finished and committed, run `/clear`. A fresh session reloads `CLAUDE.md`, which is where your rules live. Long sessions drift.
- **Plan first, then approve.** Press `Shift+Tab` to cycle into plan mode for anything that touches a migration, an event, auth, or more than three files. Read the plan. Say no to anything you do not understand.
- **Make Claude prove things.** "Done" means a command and its output. Ask: "show me the test output and the diff."
- **Commit small and often**, on a branch, only after you read the diff. You asked Claude not to commit; keep it that way until you trust the loop.
- **Never answer an open question by letting Claude guess.** Answer it yourself in `docs/OPEN_QUESTIONS.md`.
- **Anything wrong with the plan?** Press `Esc` to stop, then say what to change. Use `/rewind` or `git restore` if a change went the wrong way.
- Do not paste secrets or real ratepayer data into prompts. Use synthetic data (Framework §8).
- Ask for **fewer things better**. A slice you can review in 15 minutes is the right size.

## Part 3: The prompts, in order

### Prompt 0: Comprehension check (2 minutes, do this first)

```
Before touching anything, tell me in your own words, from CLAUDE.md and the docs it imports:
1. Who owns ratepayer and property identity, and what does iDARMS store?
2. Trace what happens, step by step, when a field agent registers a new property. Where is that agent onboarded, and what does CROIP know about them?
3. Trace how iDARMS learns its assigned MMDAs today, and what is missing.
4. A concessionaire manages several MMDAs. What does that change in the replica and in registration checks?
5. List the open questions that block the most work.
Do not read code yet and do not edit anything.
```

If any answer is wrong, fix the pack, not the prompt. Wrong here means wrong everywhere.

### Prompt 1: The audit (the most important step)

Use `/audit`. It starts by reading your git history, branches, READMEs and any existing notes to recover what you were trying to build, and records that in STATUS.md under "Intent and history". Check that section first: if it misreads your intent, correct it in the file before going further. For a big codebase, run it per area: `/audit billing`, `/audit payments`, `/audit property and ratepayer`, `/audit auth and tenancy`, `/audit messaging and outbox`. Then:

```
Now consolidate all audit results into docs/STATUS.md, with no UNKNOWN rows left.
Group findings by risk: money correctness, tenant leaks, data-ownership (WRONG MODEL), everything else.
For each WRONG MODEL item list the files, the tables, and what depends on it.
```

**Read STATUS.md yourself.** This is your real picture of where iDARMS stands.

### Prompt 2: Decide the open questions

```
List the open questions in docs/OPEN_QUESTIONS.md that block the first three slices you
recommend. For each, give me the options, the consequence of each for iDARMS, and what
CROIP's side must provide. I will answer. Write my answers as ADR-0002, ADR-0003 and so on in docs/decisions/.
```

You are building both sides, so you can **settle O1, O2, O3, O4 and O7 with your CROIP work**. They are contract decisions, and iDARMS cannot be finished correctly until CROIP answers them. Put each answer in both repositories.

### Prompt 3: Fix anything built on the old model (only if the audit found WRONG MODEL)

```
The audit found parts of iDARMS that treat ratepayers/properties as locally authoritative.
Produce a migration plan only, no edits. Use expand-contract: add CROIP-ID columns and the replica
tables, backfill by matching to CROIP, switch readers, stop local writers, then remove.
Cover: existing local IDs referenced by bills and payments, rows that CROIP does not know about,
rollback, and the order of work. Wait for my approval.
```

### Prompt 4: Slices (`/slice ...`). Phase 1 only, in this order, subject to the audit

Billing, payments and reporting are **not** in this list. Leave them alone until Phase 1 is done.

1. `/slice CroipAuthClient and CroipHttpClient: client-credentials token fetch with cache and single refresh, no secret in logs, retry only on 5xx and network errors, idempotency key passthrough, expiresAt tracking, tests against a stub CROIP`
2. `/slice BoundaryProvider with ManualImportBoundaryProvider: assigned MMDA cache table (assemblyId, code, name, contractEnd, polygon, version), plus a local point-in-polygon and polygon-in-MMDA pre-check`
3. `/slice property registration proxy: validate, pre-check against our MMDAs, generate idempotencyKey at capture time, call CROIP, return CROIP's response, pending_registrations with same-key retry. Do NOT write the replica`
4. `/slice ratepayer registration proxy with the same pattern. Handle the password question as an OPEN: O19 flag`
5. `/slice replica tables and CroipSyncSource consumer with a FixtureSyncSource: idempotent, version-ordered, scope-filtered by assembly, dead-letter for malformed input, replica read-only to every route`
6. `/slice connection status and ops page (token ok, last call, expiresAt, assigned MMDAs, replica lag, pending registrations, dead letters)`
7. `/slice the ten Phase 1 acceptance tests from docs/context/04 section 5, one test per item`

Do **not** wire a real CROIP sync source until O17 is answered, and do not use CROIP's `GET /v1/properties` or `GET /v1/ratepayers/directory` to fill the replica (G5).

### Prompt 5: The review habit, after every slice

```
/review
```
Then read the result yourself before committing.

### Prompt 6: Keeping both repos in step (run in a Claude Code session **started in the CROIP repo**, read-only)

```
Read docs/context/02-croip-integration-contract.md from the iDARMS repo at <path>. For every
row, verify it against the current CROIP code. List rows that are now wrong, endpoints or events
that exist and are missing from the contract, and any breaking change since commit 9be15da.
Do not edit anything. Output a table I can paste into the contract.
```
Run it whenever CROIP changes materially, and before every release.

## Part 4: A session routine

1. Open a terminal in the repo, start `claude`.
2. `/status`, read it, pick one slice.
3. Run the slice with `/slice`. Approve the plan only when you understand it.
4. `/review`, fix, then read the diff yourself, then commit.
5. `/clear`. Repeat.

Bring back to this chat: the audit summary, any answer to an open question that you want a second opinion on, and anything Claude Code did that surprised you.

## Part 5: Mistakes to avoid

- Starting to build before the audit exists.
- Letting Claude "tidy up" things you did not ask for. Add "change only what this slice needs" when it wanders.
- Accepting a green test run without checking that the tests actually test tenancy and duplicates.
- Treating the Framework as a finished standard. It is a draft, and ADR-0001 already departs from it.
- Letting CROIP and iDARMS disagree silently. The contract file is the only place both are described. Change it first, then the code.
