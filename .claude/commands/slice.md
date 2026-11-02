---
description: Plan then implement one small vertical slice end to end
argument-hint: "<what to build, e.g. 'property replica consumer'>"
---
Build exactly this slice: $ARGUMENTS

1. Re-read `CLAUDE.md`, the contract, `docs/OPEN_QUESTIONS.md` and the relevant rows of `docs/STATUS.md`.
2. If the slice depends on an unanswered open question, say which one and stop unless a proposed default exists. If you use a default, mark the code `// OPEN: Ox`.
3. **Write a plan and wait for my approval before editing anything.** The plan lists: files to change, schema/migration changes, event or API contract changes, tests to write (including tenancy, duplicate-event and retry cases), and what could go wrong.
4. After approval: implement in small steps. Write the tests first for contract and tenancy behaviour. Run `npm run typecheck` and `npm test`.
5. Run `/croip-check diff` and fix every must-fix item.
6. Update `docs/STATUS.md` (with evidence) and `docs/OPEN_QUESTIONS.md`. Propose a commit message. Do not commit or push.
7. Finish with: what changed, what is verified, what is not, and the next slice.
