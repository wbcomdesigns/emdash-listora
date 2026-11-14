# Listora 0.8.0 plan

**Status: LOCKED on 2026-11-14.** Scope is `SCOPE.md`. An agent does not change scope, add options or reorder steps. If a task cannot be done as written, stop, say why on its issue, and wait for the owner. (The 0.5.0 plan is in git history.)

Every task is a GitHub issue under the `0.8.0` milestone, worked on branch `0.8.0`. One builder at a time in this repo: the tasks touch the same files (types, index, kit), so parallel builders would collide.

## Order of work

| Step | Issue | Task | Needs |
| --- | --- | --- | --- |
| 1 | state to KV | Dropped by the owner on 2026-11-14 (SCOPE Decisions, item 10): no owner value, 7 paths over 9 calls | - |
| 2 | types store | SCOPE 1 and 2: the settings types record, raw slugs, every reader moved, Software seeded as a built-in (fields only; its look is step 7) | 1 |
| 3 | indexes and slots | SCOPE 5 and 11: `n1` to `n3` in the index filled by the hooks, composite indexes, unused ones removed, slot backfill through the sweep, slot sort on the `listings` route | 2 |
| 4 | type editor | SCOPE 3: the Types admin page, type form, fields table and add-field form, delete rules | 2 |
| 5 | field values and location-less | SCOPE 4 and 6: submit, edit, listing page, cards, CSV; every location surface checks the flag | 2, 4 |
| 5b | sample data to the kit | SCOPE 14: sample listings and reviews as a kit data file, an admin-only kit page that loads them in steps, the backend loader reduced to an admin write route; type editor refuses labels that match a standard CSV column | 5 |
| 6 | kit on the index and search | SCOPE 7 and 8: directory pages through the `listings` route, keywords through core search, card without description | 3 |
| 7 | Software look | SCOPE 9: card, listing-page sections, SoftwareApplication data, nofollow ugc, browser-side GitHub data, sample listings | 5, 6 |
| 7b | walk A fixes | Issue #102: sample duplicates past 100 listings, CSV city on location-less types, custom slot sort check, field help text, Details layout, types table at 390 | 7 |
| 8 | sync, scale and lows | SCOPE 12 and 13: sync guide, sweep follow-on, 6,000-listing budget and filter/sort tests, #91, #87, starter #9 | 3, 6 |
| 9 | release | version, changelog, registry texts, what's new, docs for every new screen, QA checklist rows, `bin/gate.sh`, independent walk (Node + Cloudflare), review, owner says publish | all |

Steps 3 and 4 may run one after the other in either order; nothing else moves.

## Rules every task follows

- Load the `emdash-plugin-development` skill and read its `references/build-check-publish.md` and `release-gate.md` first.
- Docs first: check each EmDash API, hook and config in the `emdash-docs` MCP (or over HTTP: `curl -s -X POST https://docs.emdashcms.com/mcp ...`, see the skill); name any deviation and its source line in the PR.
- Every behaviour change has a test that fails on the old code. Every entry point stays at 9 bridge calls or fewer (`tests/bridge-budget.test.ts`); re-pin only what the task moves, and say why.
- Publish with `_rev` from getVersioned (the docs' rule). Install and activate never throw. One-shot steps alternate two names. Nothing depends on a plugin update hook.
- Every admin screen: Block Kit elements the docs allow on admin pages (no repeater or media picker), names never ids, empty, loading and error states. Every kit screen: 1440, 768, 390, light and dark, keyboard, escaped output.
- Commit with explicit paths, no AI attribution. Push the `0.8.0` branch; comment on the task's issue with what was done, the tests and the budget numbers. Never merge, tag or publish.

## Giving a task to an agent

One Opus builder per step, briefed with this file, `SCOPE.md`, the step's issue and the skill. After each step the builder's tests and `gate.sh` pass on the branch. A Sonnet walker checks visible screens at steps 5, 7 and 9.
